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

/**
 * Resolves a PLATFORM_DEFAULT statement to the specified language, otherwise returns an exact copy.
 * @param language
 * @param statement
 */
export const toPlatformDefault = (language: QueryLanguage, statement: Statement): Statement => ({
    text: statement.text,
    language: statement.language == 'PLATFORM_DEFAULT' ? language : statement.language
});
