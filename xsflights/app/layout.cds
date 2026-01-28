using { FlightService } from '../srv/flight-service';


annotate FlightService.Connections with @UI.LineItem:[
    {Value: ID},
    {Value: (airline.ID)},
    {Value: (origin.ID)},
    {Value: (destination.ID)},
    {Value: (departure)},
    {Value: (arrival)},
    
];



annotate FlightService.Flights with @UI.LineItem:[
    {Value: flight.ID},
    {Value: date},
    {Value: aircraft},
    {Value: price},
    {Value: currency},
    {Value: maximum_seats},
    {Value: occupied_seats},
];

annotate FlightService.Airlines with @UI.LineItem:[
    {Value: ID},
    {Value: name},
    {Value: icon},
    {Value: currency},
];

annotate FlightService.Airports with @UI.LineItem:[
    {Value: ID},
    {Value: name},
    {Value: city},
    {Value: country},
];

annotate FlightService.Supplements with @UI.LineItem:[
    {Value: type.name},
    {Value: descr},
    {Value: price},
    {Value: currency},
];