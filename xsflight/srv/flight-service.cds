using { sap.capire.flights as my } from '../db/schema';

service FlightsService {
  entity Connections as projection on my.Connections;
  entity Flights as projection on my.Flights;
  entity Airlines as projection on my.Airlines;
  entity Airports as projection on my.Airports;
  entity Supplements as projection on my.Supplements;
}

// annotate  FlightsService.Flights with {
    
//     flight @title: 'Flight Connection';
//     date   @title: 'Flight Date';
//     aircraft @title: 'Aircraft Type';
//     price  @title: 'Ticket Price';
//     currency @title: 'Currency';
//     maximum_seats @title: 'Maximum Seats';
//     occupied_seats @title: 'Occupied Seats';
// };
