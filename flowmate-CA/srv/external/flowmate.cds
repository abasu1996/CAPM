@cds.external
@cds.persistence.skip
@path: '/odata/v4/flowmate'
service FlowmateService {
  @cds.persistence.skip
  entity ProcessRequests {
    key ID              : UUID;
        referenceNumber : String(30);
        title           : String(255);
        status_code     : String(20);
        requester       : String(100);
        createdAt       : Timestamp;
  }
}
