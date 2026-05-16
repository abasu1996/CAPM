namespace db.suppliershield;

using {cuid, managed}from '@sap/cds/common';

aspect primary: cuid, managed {};

entity SupplierShield : primary {
    firstName : String(255);
    lastName : String(255);
    Description : String(255);
    IsActive : Boolean;
    @mandatory
    email: String(255);
}