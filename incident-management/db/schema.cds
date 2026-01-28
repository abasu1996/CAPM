namespace sap.capire.incidents;

using
{
    cuid,
    managed,
    sap.common.CodeList
}
from '@sap/cds/common';

/**
 * Incidents created by Customers.
 */
entity Incidents : cuid, managed
{
    customer : Association to one Customers;
    title : String
        @title : 'Title';
    urgency : Association to one Urgency default 'M';
    status : Association to one Status default 'N';
    virtual isCreatedToday : Boolean;
    conversation : Composition of many 
    {
        key ID : UUID;
        timestamp : type of managed:createdAt
            @cds.on.insert : $now
            @readonly
            @title : '{i18n>CreatedAt}'
            @Core.Immutable
            @UI.ExcludeFromNavigationContext
            @UI.HiddenFilter;
        author : type of managed:createdBy
            @cds.on.insert : $user
            @readonly
            @title : '{i18n>CreatedBy}'
            @Core.Immutable
            @UI.ExcludeFromNavigationContext
            @UI.HiddenFilter;
        message : String;
    };
}

/**
 * Customers entitled to create support Incidents.
 */
entity Customers : managed
{
    key ID : String;
    firstName : String;
    lastName : String;
    name : String = trim(firstName || ' ' || lastName);
    email : EMailAddress;
    phone : PhoneNumber;
    incidents : Association to many Incidents on incidents.customer = $self;
    creditCardNo : String(16)
        @assert.format : '^[1-9]\d{15}$';
    addresses : Composition of many Addresses on addresses.customer = $self;
}

entity Addresses : cuid, managed
{
    customer : Association to one Customers;
    city : String;
    postCode : String;
    streetAddress : String;
}

entity Status : CodeList
{
    key code : String enum
    {
        new = 'N';
        assigned = 'A';
        in_process = 'I';
        on_hold = 'H';
        resolved = 'R';
        closed = 'C';
    };
    criticality : Integer;
}

entity Urgency : CodeList
{
    key code : String enum
    {
        high = 'H';
        medium = 'M';
        low = 'L';
    };
}

entity Books
{
    key ID : UUID;
    title : localized String;
    descr : localized String;
    price : Decimal;
}

type EMailAddress : String;

type PhoneNumber : String;


