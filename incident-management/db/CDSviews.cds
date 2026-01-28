// namespace sap.capire.incidents;

// using { sap.capire.incidents.Incidents, sap.capire.incidents.Customers } from './schema';

// context CDSviews {
//     define view CustomersWithIncidents as select from Customers inner join Incidents on Incidents.customer = customer{
//         Incidents.customer,
//     }
// }


namespace sap.capire.incidents.CDSviews;

using {
  sap.capire.incidents.Customers,
  sap.capire.incidents.Incidents
} from './schema';

entity CustomersWithIncidents
  as select from Customers
  inner join Incidents as I
    on I.customer.ID = Customers.ID {

    key Customers.ID        as CustomerID,
    Customers.firstName as CustomerFirstName,
    Customers.lastName  as CustomerLastName,
    Customers.email     as Email,

    key I.ID,
    I.title,
    I.status,
    I.urgency.code,
    I.createdAt
};

