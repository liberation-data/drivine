import { QueryLanguage } from '@/query/QueryLanguage';

export interface Statement {
    text: string;
    language: QueryLanguage;
}
