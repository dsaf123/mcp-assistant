
interface Entity {
    name: string;
    entityType: string;
    observations: string[];
}

interface Relation {
    from: string;
    to: string;
    relationType: string;
}

interface EntityObservation {
    entityName: string;
    observation: string;
}
