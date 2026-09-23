const cds = require("@sap/cds");

const SHARED_ENTITIES = [
  "Users",
  "Teams",
  "TeamMembers",
  "Vendors",
  "Delegations",
  "Sites",
  "Materials",
  "Wbs",
  "DocumentTypes",
  "CompanyCodes",
  "PurchasingGroups",
  "Divisions",
  "ApplicableTaxes",
  "Plant",
  "ServiceGroups",
  "ValuationClass",
  "StorageLocation",
  "SalesOrg",
  "Incoterms",
  "CostCenter",
  "MatGroup",
  "ProfitCenter",
  "MRPType",
  "AvailabilityCheck",
  "SerialNumberProfile",
  "DistributionChannel"
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
