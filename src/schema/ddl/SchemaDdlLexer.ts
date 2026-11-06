/**
 * A refusal of schema DDL: what a SQL store cannot honour, or what is not well formed, and why. SchemaDdl gives its
 * message as the result.
 */
export function refusal(message: string): Error {
    const error = new Error(message);
    error.name = REFUSAL;
    return error;
}

/** Whether the failure is a refusal. */
export function isRefusal(failure: unknown): failure is Error {
    return failure instanceof Error && failure.name === REFUSAL;
}

const REFUSAL = 'SchemaDdlRefusal';

export type Type = 'WORD' | 'NAME' | 'STRING' | 'NUMBER' | 'PARAMETER' | 'SYMBOL' | 'END' | 'BAD';

/** A token: a WORD is a bare identifier or keyword, a NAME one in backticks, `text` what it reads as. */
export interface Token {
    type: Type;
    text: string;
    value?: unknown;
}

export function described(token: Token): string {
    switch (token.type) {
        case 'END':
            return 'the end';
        case 'NAME':
            return `\`${token.text}\``;
        case 'PARAMETER':
            return `$${token.text}`;
        default:
            return `'${token.text}'`;
    }
}

const LETTER = /\p{L}/u;
const LETTER_OR_DIGIT = /[\p{L}\p{Nd}]/u;
const DIGIT = /[0-9]/;
const SPACE = /\s/;

/** Reads the text into tokens as they are asked for, so that a statement that is not DDL is read no further than its first few. */
export class Lexer {
    private at = 0;

    constructor(private readonly text: string) {}

    next(): Token {
        this.skipSpace();
        const text = this.text;
        if (this.at >= text.length) {
            return { type: 'END', text: '' };
        }
        const c = text[this.at];
        if (c === '`') {
            return this.quoted();
        }
        if (c === "'" || c === '"') {
            return this.string(c);
        }
        if (DIGIT.test(c)) {
            return this.number();
        }
        if (LETTER.test(c) || c === '_') {
            return { type: 'WORD', text: this.word() };
        }
        if (c === '$') {
            return this.parameter();
        }
        if (c === ':' && text.startsWith('::', this.at)) {
            this.at += 2;
            return { type: 'SYMBOL', text: '::' };
        }
        this.at++;
        return { type: 'SYMBOL', text: c };
    }

    private skipSpace(): void {
        const text = this.text;
        while (this.at < text.length) {
            if (SPACE.test(text[this.at])) {
                this.at++;
            } else if (text.startsWith('//', this.at)) {
                const end = text.indexOf('\n', this.at);
                this.at = end < 0 ? text.length : end + 1;
            } else if (text.startsWith('/*', this.at)) {
                const end = text.indexOf('*/', this.at + 2);
                this.at = end < 0 ? text.length : end + 2;
            } else {
                return;
            }
        }
    }

    private word(): string {
        const start = this.at;
        while (this.at < this.text.length && (LETTER_OR_DIGIT.test(this.text[this.at]) || this.text[this.at] === '_')) {
            this.at++;
        }
        return this.text.substring(start, this.at);
    }

    /** A name in backticks, a doubled backtick in it standing for one. */
    private quoted(): Token {
        const text = this.text;
        let name = '';
        this.at++;
        while (this.at < text.length) {
            const c = text[this.at++];
            if (c !== '`') {
                name += c;
            } else if (this.at < text.length && text[this.at] === '`') {
                name += '`';
                this.at++;
            } else {
                return { type: 'NAME', text: name };
            }
        }
        return { type: 'BAD', text: 'A name in backticks has no closing backtick.' };
    }

    private string(quote: string): Token {
        const text = this.text;
        let value = '';
        this.at++;
        while (this.at < text.length) {
            const c = text[this.at++];
            if (c === quote) {
                return { type: 'STRING', text: value };
            }
            if (c === '\\' && this.at < text.length) {
                const escaped = text[this.at++];
                const hex = text.substring(this.at, this.at + 4);
                switch (escaped) {
                    case 'n':
                        value += '\n';
                        break;
                    case 't':
                        value += '\t';
                        break;
                    case 'r':
                        value += '\r';
                        break;
                    case 'b':
                        value += '\b';
                        break;
                    case 'f':
                        value += '\f';
                        break;
                    case 'u':
                        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                            value += String.fromCharCode(parseInt(hex, 16));
                            this.at += 4;
                        } else {
                            value += 'u';
                        }
                        break;
                    default:
                        value += escaped;
                }
            } else {
                value += c;
            }
        }
        return { type: 'BAD', text: 'A string has no closing quote.' };
    }

    private number(): Token {
        const start = this.at;
        this.digits();
        if (this.text[this.at] === '.' && DIGIT.test(this.text[this.at + 1] ?? '')) {
            this.at++;
            this.digits();
        }
        if (this.text[this.at] === 'e' || this.text[this.at] === 'E') {
            const mark = this.at;
            this.at++;
            if (this.text[this.at] === '+' || this.text[this.at] === '-') {
                this.at++;
            }
            if (!this.digits()) {
                this.at = mark;
            }
        }
        const written = this.text.substring(start, this.at);
        return { type: 'NUMBER', text: written, value: Number(written) };
    }

    /** Reads past the digits at the place, and says whether there were any. */
    private digits(): boolean {
        const start = this.at;
        while (this.at < this.text.length && DIGIT.test(this.text[this.at])) {
            this.at++;
        }
        return this.at > start;
    }

    private parameter(): Token {
        this.at++;
        const name = this.at < this.text.length && this.text[this.at] === '`' ? this.quoted().text : this.word();
        return { type: 'PARAMETER', text: name };
    }
}
