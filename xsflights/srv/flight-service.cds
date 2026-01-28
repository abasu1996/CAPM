using { sap.capire.flights as my } from '../db/schema';

service FlightService @(path: '/flights') {

  entity Flights as projection on my.Flights;
  
  entity Airlines as projection on my.Airlines;
  
  entity Airports as projection on my.Airports;
  
  entity Connections as projection on my.Connections;
  
  entity Supplements as projection on my.Supplements;
  
  entity SupplementTypes as projection on my.SupplementTypes;
}


// annotate FlightService.Airlines with{
    
//     ID @title : 'Airline ID';
//     name @title : 'Airline Name';
//     icon @title : 'Airline Icon';
//     currency @title : 'Airline Currency';
// } ;

// annotate FlightService.Airports with {
    
//     ID @title : 'Airport ID';
//     name @title : 'Airport Name';
//     city @title : 'City';
//     country @title : 'Country';
// } ;

// annotate FlightService.Connections with {
    
//     ID @title : 'Connection ID';
//     airline @title : 'Airline';
//     origin @title : 'Origin Airport';
//     destination @title : 'Destination Airport';
//     departure @title : 'Departure Time';
//     arrival @title : 'Arrival Time';
//     distance @title : 'Distance (km)';
// } ;


