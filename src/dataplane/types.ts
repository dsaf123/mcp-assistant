import {
    ColumnType,
    Generated,
    Insertable,
    JSONColumnType,
    Selectable,
    Updateable,
  } from 'kysely'
  
  export interface Database {
    entity: EntityTable
    relation: RelationTable
    entity_observation: EntityObservationTable
  }
  

  export interface EntityTable {
    user_id: string
    name: string
    type: string
    created_at: ColumnType<Date, string | undefined, never>
  }
  

  export type Entity = Selectable<EntityTable>
  export type NewEntity = Insertable<EntityTable>
  export type EntityUpdate = Updateable<EntityTable>
  
  export interface RelationTable {
    user_id: string
    from: string
    to: string
    type: string
  }
  
  export type Relation = Selectable<RelationTable>
  export type NewRelation = Insertable<RelationTable>
  export type RelationUpdate = Updateable<RelationTable>

  export interface EntityObservationTable {
    user_id: string
    entity_name: string
    observation: string
  }

  export type EntityObservation = Selectable<EntityObservationTable>
  export type NewEntityObservation = Insertable<EntityObservationTable>
  export type EntityObservationUpdate = Updateable<EntityObservationTable>