using { sap.capire.flights } from './schema.cds';


annotate flights.Airlines with {
    ID @title : '{i18n>AirlineID}';
    name @title : '{i18n>AirlineName}';
    icon @title : '{i18n>AirlineIcon}';
    currency @title : '{i18n>AirlineCurrency}';
} ;
annotate flights.Airports with {
    ID @title : '{i18n>AirportID}';
    name @title : '{i18n>AirportName}';
    city @title : '{i18n>City}';
    country @title : '{i18n>Country}';
} ;
annotate flights.Connections with {
    ID @title : '{i18n>ConnectionID}';
    airline @title : '{i18n>Airline}';
    origin @title : '{i18n>OriginAirport}';
    destination @title : '{i18n>DestinationAirport}';
    departure @title : '{i18n>DepartureTime}';
    arrival @title : '{i18n>ArrivalTime}';
    distance @title : '{i18n>DistanceKm}';
} ;



