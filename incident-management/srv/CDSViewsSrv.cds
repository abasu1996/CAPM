using { sap.capire.incidents.CDSviews } from '../db/CDSviews';

service CDSViewsSrv {
    entity CustomersWithIncidents as select from CDSviews.CustomersWithIncidents;
}