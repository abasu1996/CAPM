namespace my.bp;

entity BusinessPartner {
  key ID : UUID;
  name : String;
  Addresses : Composition of many Address on Addresses.partner = $self; // 1:N
  Roles : Association to many BP_Role;              // M:N via junction
}

entity Address {
  key ID : UUID;
  partner : Association to BusinessPartner;
  street : String;
  city   : String;
}

entity BP_Role {
  key ID : UUID;
  roleName : String;
}

entity PartnerRoles {
  partner : Association to BusinessPartner;
  role    : Association to BP_Role;
}