using { capmcpserver.db } from '../db/schema';

service CustomerService @(path: '/customer') {
    entity Customers as projection on db.Customers;
}
