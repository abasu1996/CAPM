using { ns.beginner as bg } from '../db/schema';

service BeginnerService {

    @odata.draft.enabled
    entity Books as projection on bg.Books;

}
