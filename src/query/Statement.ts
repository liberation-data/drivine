import { QueryLanguage } from '@/query/QueryLanguage';

export interface Statement {
    text: string;
    language: QueryLanguage;
}

export interface CypherStatement extends Statement {
    text: string;
    language: 'CYPHER';
}

export const cypherStatement = (text: string): CypherStatement => ({ text: text, language: 'CYPHER' });

export interface SqlStatement extends Statement {
    text: string;
    language: 'SQL';
}

export const sqlStatement = (text: string): SqlStatement => ({ text: text, language: 'SQL' });
