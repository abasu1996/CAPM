@cds.external
@cds.persistence.skip
@path: '/odata/v4/flowmate-ca'
service FlowmateCAService {
  @cds.persistence.skip
  entity Requests {
    key ID            : UUID;
        referenceNumber : String(40);
        title           : String(255);
        status_code     : String(30);
        requesterName   : String(160);
        createdAt       : Timestamp;
  }
}
