using {db.suppliershield as ss} from '../db/schema';



Service SupplierShieldService {
    
    entity SupplierShield as projection on ss.SupplierShield;

    function getVerifiedSuppliers(params : String) returns String;
    function findDuplicateSuppliers(firstName : String, lastName : String, email : String) returns many SupplierShield;
}
