const cds = require("@sap/cds");

const SHARED_ENTITIES = [
  "Users",
  "Teams",
  "TeamMembers",
  "Vendors",
  "Delegations"
];

module.exports = class CAMasterDataService extends cds.ApplicationService {
  async init() {
    const master = await cds.connect.to("CommonMasterDataService");

    this.on(["READ", "CREATE", "UPDATE", "DELETE"], SHARED_ENTITIES, (req) => {
      return master.run(req.query);
    });

    return super.init();
  }
};
