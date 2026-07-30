const cds = require("@sap/cds");
const { SELECT, INSERT, UPDATE, DELETE } = cds.ql;

module.exports = class CommonMasterDataService extends cds.ApplicationService {
  async init() {
    const {
      Users,
      Teams,
      TeamMembers
    } = this.entities;

    this.before("READ", Users, (req) => {
      if (!this._isMasterDataAdministrator(req)) {
        req.query.where({ isActive: true });
      }
    });

    this.before(["CREATE", "UPDATE"], Users, async (req) => {
      if (!this._canProvisionUsers(req)) {
        return req.reject(403, "Master-data administration or user provisioning authority is required");
      }

      if (req.event === "CREATE") {
        req.data.referenceNumber ||= await this._nextReferenceNumber(req, Users, "USR");
      }

      const sUserId = this._requestId(req);
      const oExisting = req.event === "UPDATE" && sUserId
        ? await cds.tx(req).run(SELECT.one.from(Users).where({ ID: sUserId }))
        : {};
      const oUser = this._normalizeUser({ ...oExisting, ...req.data });

      oUser.referenceNumber ||= await this._nextReferenceNumber(req, Users, "USR");
      await this._validateMaintainedUser(req, oUser, Users);
      Object.assign(req.data, this._writableUserData(oUser));
    });

    this.before("DELETE", Users, (req) => {
      if (!this._canProvisionUsers(req)) {
        return req.reject(403, "Master-data administration or user provisioning authority is required");
      }

      return req.reject(405, "Deactivate users instead of deleting them to preserve workflow history");
    });

    this.on("createUserWithTeams", async (req) => {
      if (!this._canProvisionUsers(req)) {
        return req.reject(403, "Master-data administration or user provisioning authority is required");
      }

      return this._createUserWithTeams(req, Users, Teams, TeamMembers);
    });

    this.before(["CREATE", "UPDATE"], Teams, async (req) => {
      const sTeamId = this._requestId(req);
      const oExisting = req.event === "UPDATE" && sTeamId
        ? await cds.tx(req).run(SELECT.one.from(Teams).where({ ID: sTeamId }))
        : {};
      const oTeam = { ...oExisting, ...req.data };

      oTeam.teamCode = oTeam.teamCode?.trim();
      oTeam.name = oTeam.name?.trim();

      if (!oTeam.teamCode || !oTeam.name) {
        return req.reject(400, "Team code and team name are required");
      }

      const oDuplicate = await cds.tx(req).run(
        SELECT.one.from(Teams).where({ teamCode: oTeam.teamCode })
      );

      if (oDuplicate && oDuplicate.ID !== sTeamId) {
        return req.reject(409, "A team already exists with the same team code");
      }

      req.data.teamCode = oTeam.teamCode;
      req.data.name = oTeam.name;
      req.data.referenceNumber ||= oExisting.referenceNumber
        || await this._nextReferenceNumber(req, Teams, "TEM");
    });

    this.before("CREATE", TeamMembers, async (req) => {
      if (!req.data.team_ID || !req.data.user_ID) {
        return req.reject(400, "Select a team and a user");
      }

      const [oTeam, oUser, oExisting] = await Promise.all([
        this._getTeam(req, req.data.team_ID, Teams),
        this._getUser(req, req.data.user_ID, Users),
        cds.tx(req).run(SELECT.one.from(TeamMembers).where({
          team_ID: req.data.team_ID,
          user_ID: req.data.user_ID
        }))
      ]);

      if (!oTeam) {
        return req.reject(400, "Selected team was not found");
      }
      if (!oUser) {
        return req.reject(400, "Selected user was not found");
      }
      if (oExisting) {
        return req.reject(409, "This user is already maintained under the team");
      }

      req.data.referenceNumber ||= await this._nextReferenceNumber(req, TeamMembers, "TMM");
      this._setTeamMemberSnapshot(req.data, oUser);
    });

    this.before("UPDATE", TeamMembers, async (req) => {
      const sMembershipId = this._requestId(req);
      const oMembership = sMembershipId
        ? await cds.tx(req).run(SELECT.one.from(TeamMembers).where({ ID: sMembershipId }))
        : null;
      req.data.referenceNumber ||= oMembership?.referenceNumber
        || await this._nextReferenceNumber(req, TeamMembers, "TMM");

      const sUserId = req.data.user_ID || oMembership?.user_ID;
      const oUser = sUserId
        ? await this._getUser(req, sUserId, Users)
        : null;
      if (!oUser) {
        return req.reject(400, "Selected user was not found");
      }

      this._setTeamMemberSnapshot(req.data, oUser);
    });

    this.on("getUserAdministrationCapabilities", (req) => ({
      canMaintainUsers: this._canProvisionUsers(req)
    }));

    return super.init();
  }

  async _createUserWithTeams(req, Users, Teams, TeamMembers) {
    const sUserId = req.data.userId || null;
    const tx = cds.tx(req);
    const oExistingUser = sUserId
      ? await tx.run(SELECT.one.from(Users).where({ ID: sUserId }))
      : null;

    if (sUserId && !oExistingUser) {
      return req.reject(404, "User was not found");
    }

    const aExistingMemberships = oExistingUser
      ? await tx.run(SELECT.from(TeamMembers).where({ user_ID: sUserId }))
      : [];
    const bTeamIdsProvided = Object.prototype.hasOwnProperty.call(req.data, "teamIds");
    const aRequestedTeamIds = bTeamIdsProvided
      ? req.data.teamIds || []
      : aExistingMemberships.map((oMembership) => oMembership.team_ID);
    const aTeamIds = [...new Set(aRequestedTeamIds
      .map((vTeamId) => typeof vTeamId === "string" ? vTeamId : vTeamId?.ID || vTeamId?.teamId)
      .filter(Boolean))];
    const oUser = this._normalizeUser({
      ID: oExistingUser?.ID || cds.utils.uuid(),
      referenceNumber: oExistingUser?.referenceNumber
        || await this._nextReferenceNumber(req, Users, "USR"),
      azureObjectId: Object.prototype.hasOwnProperty.call(req.data, "azureObjectId")
        ? req.data.azureObjectId || null
        : oExistingUser?.azureObjectId || null,
      userPrincipalName: req.data.userPrincipalName || oExistingUser?.userPrincipalName,
      displayName: req.data.displayName || oExistingUser?.displayName,
      email: req.data.email || oExistingUser?.email,
      department: Object.prototype.hasOwnProperty.call(req.data, "department")
        ? req.data.department || null
        : oExistingUser?.department || null,
      manager_ID: Object.prototype.hasOwnProperty.call(req.data, "managerId")
        ? req.data.managerId || null
        : oExistingUser?.manager_ID || null,
      isActive: typeof req.data.isActive === "boolean"
        ? req.data.isActive
        : oExistingUser?.isActive !== false
    });

    await this._validateMaintainedUser(req, oUser, Users);

    const aTeams = [];
    for (const sTeamId of aTeamIds) {
      const oTeam = await this._getTeam(req, sTeamId, Teams);
      if (!oTeam) {
        return req.reject(400, `Active team ${sTeamId} was not found`);
      }
      aTeams.push(oTeam);
    }

    if (oExistingUser) {
      await tx.run(UPDATE(Users, oUser.ID).set(this._writableUserData(oUser)));
    } else {
      await tx.run(INSERT.into(Users).entries(oUser));
    }

    const mExistingMemberships = new Map(
      aExistingMemberships.map((oMembership) => [oMembership.team_ID, oMembership])
    );
    const oRequestedTeamIds = new Set(aTeamIds);

    for (const oMembership of aExistingMemberships) {
      if (!oRequestedTeamIds.has(oMembership.team_ID)) {
        await tx.run(DELETE.from(TeamMembers).where({ ID: oMembership.ID }));
      }
    }

    for (const oTeam of aTeams) {
      const oMembership = mExistingMemberships.get(oTeam.ID);
      const oSnapshot = {
        displayName: oUser.displayName,
        email: oUser.email,
        isActive: oUser.isActive
      };

      if (oMembership) {
        await tx.run(UPDATE(TeamMembers, oMembership.ID).set(oSnapshot));
      } else {
        await tx.run(INSERT.into(TeamMembers).entries({
          ID: cds.utils.uuid(),
          referenceNumber: await this._nextReferenceNumber(req, TeamMembers, "TMM"),
          team_ID: oTeam.ID,
          user_ID: oUser.ID,
          ...oSnapshot
        }));
      }
    }

    return tx.run(SELECT.one.from(Users).where({ ID: oUser.ID }));
  }

  _normalizeUser(oUser) {
    return {
      ...oUser,
      azureObjectId: oUser.azureObjectId?.trim() || null,
      userPrincipalName: oUser.userPrincipalName?.trim(),
      displayName: oUser.displayName?.trim(),
      email: oUser.email?.trim(),
      department: oUser.department?.trim() || null
    };
  }

  _writableUserData(oUser) {
    return {
      referenceNumber: oUser.referenceNumber,
      azureObjectId: oUser.azureObjectId,
      userPrincipalName: oUser.userPrincipalName,
      displayName: oUser.displayName,
      email: oUser.email,
      department: oUser.department,
      manager_ID: oUser.manager_ID || null,
      isActive: oUser.isActive !== false
    };
  }

  async _validateMaintainedUser(req, oUser, Users) {
    if (!oUser.displayName || !oUser.email || !oUser.userPrincipalName) {
      return req.reject(400, "Name, email, and user principal name are required");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(oUser.email)) {
      return req.reject(400, "Enter a valid email address");
    }

    if (oUser.manager_ID && oUser.manager_ID === oUser.ID) {
      return req.reject(400, "A user cannot be assigned as their own manager");
    }

    if (oUser.manager_ID) {
      const oManager = await cds.tx(req).run(
        SELECT.one.from(Users).columns("ID").where({ ID: oUser.manager_ID, isActive: true })
      );
      if (!oManager) {
        return req.reject(400, "Select an active user as the manager");
      }
    }

    const aUsers = await cds.tx(req).run(SELECT.from(Users));
    const sEmail = oUser.email.toLowerCase();
    const sPrincipal = oUser.userPrincipalName.toLowerCase();
    const bDuplicate = aUsers.some((oOther) =>
      oOther.ID !== oUser.ID
      && (
        oOther.email?.toLowerCase() === sEmail
        || oOther.userPrincipalName?.toLowerCase() === sPrincipal
        || oUser.azureObjectId && oOther.azureObjectId === oUser.azureObjectId
      )
    );

    if (bDuplicate) {
      return req.reject(409, "A user already exists with the same email, principal name, or Azure object ID");
    }
  }

  async _nextReferenceNumber(req, oEntity, sPrefix) {
    this._referenceNumberLocks ||= new Map();
    const oPrevious = this._referenceNumberLocks.get(sPrefix) || Promise.resolve();
    let fnRelease;
    const oCurrent = new Promise((resolve) => {
      fnRelease = resolve;
    });

    this._referenceNumberLocks.set(sPrefix, oPrevious.then(() => oCurrent));
    await oPrevious;

    try {
      const oLastReference = await cds.tx(req).run(
        SELECT.one.from(oEntity).columns("referenceNumber").where({
          referenceNumber: { like: `${sPrefix}-%` }
        }).orderBy("referenceNumber desc")
      );
      const iLastNumber = Number(
        (oLastReference?.referenceNumber || "").slice(sPrefix.length + 1)
      ) || 0;

      return `${sPrefix}-${String(iLastNumber + 1).padStart(6, "0")}`;
    } finally {
      fnRelease();
    }
  }

  _setTeamMemberSnapshot(oData, oUser) {
    oData.displayName = oUser.displayName;
    oData.email = oUser.email;
    oData.isActive ??= oUser.isActive !== false;
  }

  _requestId(req) {
    return req.data.ID || req.params?.[0]?.ID;
  }

  _getUser(req, sUserId, Users) {
    return cds.tx(req).run(
      SELECT.one.from(Users).where({ ID: sUserId, isActive: true })
    );
  }

  _getTeam(req, sTeamId, Teams) {
    return cds.tx(req).run(
      SELECT.one.from(Teams).where({ ID: sTeamId, isActive: true })
    );
  }

  _isMasterDataAdministrator(req) {
    return Boolean(
      req.user?.is("MasterDataAdmin")
      || req.user?.is("Admin")
      || req.user?.is("admin")
    );
  }

  _canProvisionUsers(req) {
    return Boolean(
      this._isMasterDataAdministrator(req)
      || req.user?.is("UserProvisioning")
    );
  }
};
