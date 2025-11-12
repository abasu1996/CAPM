namespace capmcpserver.db;

using { cuid, managed } from '@sap/cds/common';
entity Customers : cuid, managed {
    key ID:String(10);
    CustomerID : String(10);
    Name         : String(100);
    Email        : String(100);
    Phone        : String(20);
    Address      : String(200);
}

