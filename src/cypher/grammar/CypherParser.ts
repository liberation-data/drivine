// Generated from Cypher.g4 by ANTLR 4.13.1

import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";

// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;


export class CypherParser extends antlr.Parser {
    public static readonly T__0 = 1;
    public static readonly T__1 = 2;
    public static readonly T__2 = 3;
    public static readonly T__3 = 4;
    public static readonly T__4 = 5;
    public static readonly T__5 = 6;
    public static readonly T__6 = 7;
    public static readonly T__7 = 8;
    public static readonly T__8 = 9;
    public static readonly T__9 = 10;
    public static readonly T__10 = 11;
    public static readonly T__11 = 12;
    public static readonly T__12 = 13;
    public static readonly T__13 = 14;
    public static readonly T__14 = 15;
    public static readonly T__15 = 16;
    public static readonly T__16 = 17;
    public static readonly T__17 = 18;
    public static readonly T__18 = 19;
    public static readonly T__19 = 20;
    public static readonly T__20 = 21;
    public static readonly T__21 = 22;
    public static readonly T__22 = 23;
    public static readonly T__23 = 24;
    public static readonly T__24 = 25;
    public static readonly T__25 = 26;
    public static readonly T__26 = 27;
    public static readonly T__27 = 28;
    public static readonly T__28 = 29;
    public static readonly T__29 = 30;
    public static readonly T__30 = 31;
    public static readonly T__31 = 32;
    public static readonly T__32 = 33;
    public static readonly T__33 = 34;
    public static readonly T__34 = 35;
    public static readonly T__35 = 36;
    public static readonly T__36 = 37;
    public static readonly T__37 = 38;
    public static readonly T__38 = 39;
    public static readonly T__39 = 40;
    public static readonly T__40 = 41;
    public static readonly T__41 = 42;
    public static readonly T__42 = 43;
    public static readonly T__43 = 44;
    public static readonly T__44 = 45;
    public static readonly T__45 = 46;
    public static readonly UNION = 47;
    public static readonly ALL = 48;
    public static readonly FOREACH = 49;
    public static readonly TRANSACTIONS = 50;
    public static readonly ROWS = 51;
    public static readonly ROW = 52;
    public static readonly OPTIONAL = 53;
    public static readonly MATCH = 54;
    public static readonly UNWIND = 55;
    public static readonly AS = 56;
    public static readonly MERGE = 57;
    public static readonly ON = 58;
    public static readonly CREATE = 59;
    public static readonly SET = 60;
    public static readonly DETACH = 61;
    public static readonly DELETE = 62;
    public static readonly REMOVE = 63;
    public static readonly CALL = 64;
    public static readonly YIELD = 65;
    public static readonly WITH = 66;
    public static readonly RETURN = 67;
    public static readonly DISTINCT = 68;
    public static readonly ORDER = 69;
    public static readonly BY = 70;
    public static readonly L_SKIP = 71;
    public static readonly LIMIT = 72;
    public static readonly ASCENDING = 73;
    public static readonly ASC = 74;
    public static readonly DESCENDING = 75;
    public static readonly DESC = 76;
    public static readonly WHERE = 77;
    public static readonly SHORTESTPATH = 78;
    public static readonly ALLSHORTESTPATHS = 79;
    public static readonly OR = 80;
    public static readonly XOR = 81;
    public static readonly AND = 82;
    public static readonly NOT = 83;
    public static readonly STARTS = 84;
    public static readonly ENDS = 85;
    public static readonly CONTAINS = 86;
    public static readonly IN = 87;
    public static readonly IS = 88;
    public static readonly NULL = 89;
    public static readonly REDUCE = 90;
    public static readonly COUNT = 91;
    public static readonly CASE = 92;
    public static readonly ELSE = 93;
    public static readonly END = 94;
    public static readonly WHEN = 95;
    public static readonly THEN = 96;
    public static readonly ANY = 97;
    public static readonly NONE = 98;
    public static readonly SINGLE = 99;
    public static readonly EXISTS = 100;
    public static readonly TRUE = 101;
    public static readonly FALSE = 102;
    public static readonly HexInteger = 103;
    public static readonly DecimalInteger = 104;
    public static readonly OctalInteger = 105;
    public static readonly HexLetter = 106;
    public static readonly HexDigit = 107;
    public static readonly Digit = 108;
    public static readonly NonZeroDigit = 109;
    public static readonly NonZeroOctDigit = 110;
    public static readonly OctDigit = 111;
    public static readonly ZeroDigit = 112;
    public static readonly ExponentDecimalReal = 113;
    public static readonly RegularDecimalReal = 114;
    public static readonly StringLiteral = 115;
    public static readonly EscapedChar = 116;
    public static readonly CONSTRAINT = 117;
    public static readonly DO = 118;
    public static readonly FOR = 119;
    public static readonly REQUIRE = 120;
    public static readonly UNIQUE = 121;
    public static readonly MANDATORY = 122;
    public static readonly SCALAR = 123;
    public static readonly OF = 124;
    public static readonly ADD = 125;
    public static readonly DROP = 126;
    public static readonly FILTER = 127;
    public static readonly EXTRACT = 128;
    public static readonly UnescapedSymbolicName = 129;
    public static readonly IdentifierStart = 130;
    public static readonly IdentifierPart = 131;
    public static readonly EscapedSymbolicName = 132;
    public static readonly SP = 133;
    public static readonly WHITESPACE = 134;
    public static readonly Comment = 135;
    public static readonly RULE_oC_Cypher = 0;
    public static readonly RULE_oC_Statement = 1;
    public static readonly RULE_oC_Query = 2;
    public static readonly RULE_oC_RegularQuery = 3;
    public static readonly RULE_oC_Union = 4;
    public static readonly RULE_oC_SingleQuery = 5;
    public static readonly RULE_oC_SinglePartQuery = 6;
    public static readonly RULE_oC_MultiPartQuery = 7;
    public static readonly RULE_oC_UpdatingClause = 8;
    public static readonly RULE_oC_Foreach = 9;
    public static readonly RULE_oC_ReadingClause = 10;
    public static readonly RULE_oC_SubqueryCall = 11;
    public static readonly RULE_oC_Match = 12;
    public static readonly RULE_oC_Unwind = 13;
    public static readonly RULE_oC_Merge = 14;
    public static readonly RULE_oC_MergeAction = 15;
    public static readonly RULE_oC_Create = 16;
    public static readonly RULE_oC_Set = 17;
    public static readonly RULE_oC_SetItem = 18;
    public static readonly RULE_oC_Delete = 19;
    public static readonly RULE_oC_Remove = 20;
    public static readonly RULE_oC_RemoveItem = 21;
    public static readonly RULE_oC_InQueryCall = 22;
    public static readonly RULE_oC_StandaloneCall = 23;
    public static readonly RULE_oC_YieldItems = 24;
    public static readonly RULE_oC_YieldItem = 25;
    public static readonly RULE_oC_With = 26;
    public static readonly RULE_oC_Return = 27;
    public static readonly RULE_oC_ProjectionBody = 28;
    public static readonly RULE_oC_ProjectionItems = 29;
    public static readonly RULE_oC_ProjectionItem = 30;
    public static readonly RULE_oC_Order = 31;
    public static readonly RULE_oC_Skip = 32;
    public static readonly RULE_oC_Limit = 33;
    public static readonly RULE_oC_SortItem = 34;
    public static readonly RULE_oC_Where = 35;
    public static readonly RULE_oC_Pattern = 36;
    public static readonly RULE_oC_PatternPart = 37;
    public static readonly RULE_oC_AnonymousPatternPart = 38;
    public static readonly RULE_oC_ShortestPathPattern = 39;
    public static readonly RULE_oC_PatternElement = 40;
    public static readonly RULE_oC_QuantifiedPathPattern = 41;
    public static readonly RULE_oC_RelationshipsPattern = 42;
    public static readonly RULE_oC_NodePattern = 43;
    public static readonly RULE_oC_PatternElementChain = 44;
    public static readonly RULE_oC_PathQuantifier = 45;
    public static readonly RULE_oC_RelationshipPattern = 46;
    public static readonly RULE_oC_RelationshipDetail = 47;
    public static readonly RULE_oC_Properties = 48;
    public static readonly RULE_oC_RelationshipTypes = 49;
    public static readonly RULE_oC_NodeLabels = 50;
    public static readonly RULE_oC_NodeLabel = 51;
    public static readonly RULE_oC_RangeLiteral = 52;
    public static readonly RULE_oC_LabelName = 53;
    public static readonly RULE_oC_RelTypeName = 54;
    public static readonly RULE_oC_PropertyExpression = 55;
    public static readonly RULE_oC_Expression = 56;
    public static readonly RULE_oC_OrExpression = 57;
    public static readonly RULE_oC_XorExpression = 58;
    public static readonly RULE_oC_AndExpression = 59;
    public static readonly RULE_oC_NotExpression = 60;
    public static readonly RULE_oC_ComparisonExpression = 61;
    public static readonly RULE_oC_PartialComparisonExpression = 62;
    public static readonly RULE_oC_StringListNullPredicateExpression = 63;
    public static readonly RULE_oC_StringPredicateExpression = 64;
    public static readonly RULE_oC_ListPredicateExpression = 65;
    public static readonly RULE_oC_NullPredicateExpression = 66;
    public static readonly RULE_oC_AddOrSubtractExpression = 67;
    public static readonly RULE_oC_MultiplyDivideModuloExpression = 68;
    public static readonly RULE_oC_PowerOfExpression = 69;
    public static readonly RULE_oC_UnaryAddOrSubtractExpression = 70;
    public static readonly RULE_oC_NonArithmeticOperatorExpression = 71;
    public static readonly RULE_oC_ListOperatorExpression = 72;
    public static readonly RULE_oC_PropertyLookup = 73;
    public static readonly RULE_oC_Atom = 74;
    public static readonly RULE_oC_Reduce = 75;
    public static readonly RULE_oC_MapProjection = 76;
    public static readonly RULE_oC_MapProjectionElement = 77;
    public static readonly RULE_oC_CaseExpression = 78;
    public static readonly RULE_oC_CaseAlternative = 79;
    public static readonly RULE_oC_ListComprehension = 80;
    public static readonly RULE_oC_PatternComprehension = 81;
    public static readonly RULE_oC_Quantifier = 82;
    public static readonly RULE_oC_FilterExpression = 83;
    public static readonly RULE_oC_PatternPredicate = 84;
    public static readonly RULE_oC_ParenthesizedExpression = 85;
    public static readonly RULE_oC_IdInColl = 86;
    public static readonly RULE_oC_FunctionInvocation = 87;
    public static readonly RULE_oC_FunctionName = 88;
    public static readonly RULE_oC_ExistentialSubquery = 89;
    public static readonly RULE_oC_CountSubquery = 90;
    public static readonly RULE_oC_SubqueryReadings = 91;
    public static readonly RULE_oC_ExplicitProcedureInvocation = 92;
    public static readonly RULE_oC_ImplicitProcedureInvocation = 93;
    public static readonly RULE_oC_ProcedureResultField = 94;
    public static readonly RULE_oC_ProcedureName = 95;
    public static readonly RULE_oC_Namespace = 96;
    public static readonly RULE_oC_Variable = 97;
    public static readonly RULE_oC_KeywordVariable = 98;
    public static readonly RULE_oC_Literal = 99;
    public static readonly RULE_oC_BooleanLiteral = 100;
    public static readonly RULE_oC_NumberLiteral = 101;
    public static readonly RULE_oC_IntegerLiteral = 102;
    public static readonly RULE_oC_DoubleLiteral = 103;
    public static readonly RULE_oC_ListLiteral = 104;
    public static readonly RULE_oC_MapLiteral = 105;
    public static readonly RULE_oC_PropertyKeyName = 106;
    public static readonly RULE_oC_Parameter = 107;
    public static readonly RULE_oC_SchemaName = 108;
    public static readonly RULE_oC_ReservedWord = 109;
    public static readonly RULE_oC_SymbolicName = 110;
    public static readonly RULE_oC_LeftArrowHead = 111;
    public static readonly RULE_oC_RightArrowHead = 112;
    public static readonly RULE_oC_Dash = 113;

    public static readonly literalNames = [
        null, "';'", "'('", "'|'", "')'", "'*'", "','", "'{'", "'}'", "'='", 
        "'+='", "'+'", "'['", "']'", "':'", "'..'", "'<>'", "'<'", "'>'", 
        "'<='", "'>='", "'=~'", "'-'", "'/'", "'%'", "'^'", "'.'", "'$'", 
        "'\\u27E8'", "'\\u3008'", "'\\uFE64'", "'\\uFF1C'", "'\\u27E9'", 
        "'\\u3009'", "'\\uFE65'", "'\\uFF1E'", "'\\u00AD'", "'\\u2010'", 
        "'\\u2011'", "'\\u2012'", "'\\u2013'", "'\\u2014'", "'\\u2015'", 
        "'\\u2212'", "'\\uFE58'", "'\\uFE63'", "'\\uFF0D'", null, null, 
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, null, null, null, null, null, "'0'"
    ];

    public static readonly symbolicNames = [
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, "UNION", "ALL", "FOREACH", "TRANSACTIONS", "ROWS", 
        "ROW", "OPTIONAL", "MATCH", "UNWIND", "AS", "MERGE", "ON", "CREATE", 
        "SET", "DETACH", "DELETE", "REMOVE", "CALL", "YIELD", "WITH", "RETURN", 
        "DISTINCT", "ORDER", "BY", "L_SKIP", "LIMIT", "ASCENDING", "ASC", 
        "DESCENDING", "DESC", "WHERE", "SHORTESTPATH", "ALLSHORTESTPATHS", 
        "OR", "XOR", "AND", "NOT", "STARTS", "ENDS", "CONTAINS", "IN", "IS", 
        "NULL", "REDUCE", "COUNT", "CASE", "ELSE", "END", "WHEN", "THEN", 
        "ANY", "NONE", "SINGLE", "EXISTS", "TRUE", "FALSE", "HexInteger", 
        "DecimalInteger", "OctalInteger", "HexLetter", "HexDigit", "Digit", 
        "NonZeroDigit", "NonZeroOctDigit", "OctDigit", "ZeroDigit", "ExponentDecimalReal", 
        "RegularDecimalReal", "StringLiteral", "EscapedChar", "CONSTRAINT", 
        "DO", "FOR", "REQUIRE", "UNIQUE", "MANDATORY", "SCALAR", "OF", "ADD", 
        "DROP", "FILTER", "EXTRACT", "UnescapedSymbolicName", "IdentifierStart", 
        "IdentifierPart", "EscapedSymbolicName", "SP", "WHITESPACE", "Comment"
    ];
    public static readonly ruleNames = [
        "oC_Cypher", "oC_Statement", "oC_Query", "oC_RegularQuery", "oC_Union", 
        "oC_SingleQuery", "oC_SinglePartQuery", "oC_MultiPartQuery", "oC_UpdatingClause", 
        "oC_Foreach", "oC_ReadingClause", "oC_SubqueryCall", "oC_Match", 
        "oC_Unwind", "oC_Merge", "oC_MergeAction", "oC_Create", "oC_Set", 
        "oC_SetItem", "oC_Delete", "oC_Remove", "oC_RemoveItem", "oC_InQueryCall", 
        "oC_StandaloneCall", "oC_YieldItems", "oC_YieldItem", "oC_With", 
        "oC_Return", "oC_ProjectionBody", "oC_ProjectionItems", "oC_ProjectionItem", 
        "oC_Order", "oC_Skip", "oC_Limit", "oC_SortItem", "oC_Where", "oC_Pattern", 
        "oC_PatternPart", "oC_AnonymousPatternPart", "oC_ShortestPathPattern", 
        "oC_PatternElement", "oC_QuantifiedPathPattern", "oC_RelationshipsPattern", 
        "oC_NodePattern", "oC_PatternElementChain", "oC_PathQuantifier", 
        "oC_RelationshipPattern", "oC_RelationshipDetail", "oC_Properties", 
        "oC_RelationshipTypes", "oC_NodeLabels", "oC_NodeLabel", "oC_RangeLiteral", 
        "oC_LabelName", "oC_RelTypeName", "oC_PropertyExpression", "oC_Expression", 
        "oC_OrExpression", "oC_XorExpression", "oC_AndExpression", "oC_NotExpression", 
        "oC_ComparisonExpression", "oC_PartialComparisonExpression", "oC_StringListNullPredicateExpression", 
        "oC_StringPredicateExpression", "oC_ListPredicateExpression", "oC_NullPredicateExpression", 
        "oC_AddOrSubtractExpression", "oC_MultiplyDivideModuloExpression", 
        "oC_PowerOfExpression", "oC_UnaryAddOrSubtractExpression", "oC_NonArithmeticOperatorExpression", 
        "oC_ListOperatorExpression", "oC_PropertyLookup", "oC_Atom", "oC_Reduce", 
        "oC_MapProjection", "oC_MapProjectionElement", "oC_CaseExpression", 
        "oC_CaseAlternative", "oC_ListComprehension", "oC_PatternComprehension", 
        "oC_Quantifier", "oC_FilterExpression", "oC_PatternPredicate", "oC_ParenthesizedExpression", 
        "oC_IdInColl", "oC_FunctionInvocation", "oC_FunctionName", "oC_ExistentialSubquery", 
        "oC_CountSubquery", "oC_SubqueryReadings", "oC_ExplicitProcedureInvocation", 
        "oC_ImplicitProcedureInvocation", "oC_ProcedureResultField", "oC_ProcedureName", 
        "oC_Namespace", "oC_Variable", "oC_KeywordVariable", "oC_Literal", 
        "oC_BooleanLiteral", "oC_NumberLiteral", "oC_IntegerLiteral", "oC_DoubleLiteral", 
        "oC_ListLiteral", "oC_MapLiteral", "oC_PropertyKeyName", "oC_Parameter", 
        "oC_SchemaName", "oC_ReservedWord", "oC_SymbolicName", "oC_LeftArrowHead", 
        "oC_RightArrowHead", "oC_Dash",
    ];

    public get grammarFileName(): string { return "Cypher.g4"; }
    public get literalNames(): (string | null)[] { return CypherParser.literalNames; }
    public get symbolicNames(): (string | null)[] { return CypherParser.symbolicNames; }
    public get ruleNames(): string[] { return CypherParser.ruleNames; }
    public get serializedATN(): number[] { return CypherParser._serializedATN; }

    protected createFailedPredicateException(predicate?: string, message?: string): antlr.FailedPredicateException {
        return new antlr.FailedPredicateException(this, predicate, message);
    }

    public constructor(input: antlr.TokenStream) {
        super(input);
        this.interpreter = new antlr.ParserATNSimulator(this, CypherParser._ATN, CypherParser.decisionsToDFA, new antlr.PredictionContextCache());
    }
    public oC_Cypher(): OC_CypherContext {
        let localContext = new OC_CypherContext(this.context, this.state);
        this.enterRule(localContext, 0, CypherParser.RULE_oC_Cypher);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 229;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 228;
                this.match(CypherParser.SP);
                }
            }

            this.state = 231;
            this.oC_Statement();
            this.state = 236;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 2, this.context) ) {
            case 1:
                {
                this.state = 233;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 232;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 235;
                this.match(CypherParser.T__0);
                }
                break;
            }
            this.state = 239;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 238;
                this.match(CypherParser.SP);
                }
            }

            this.state = 241;
            this.match(CypherParser.EOF);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Statement(): OC_StatementContext {
        let localContext = new OC_StatementContext(this.context, this.state);
        this.enterRule(localContext, 2, CypherParser.RULE_oC_Statement);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 243;
            this.oC_Query();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Query(): OC_QueryContext {
        let localContext = new OC_QueryContext(this.context, this.state);
        this.enterRule(localContext, 4, CypherParser.RULE_oC_Query);
        try {
            this.state = 247;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 4, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 245;
                this.oC_RegularQuery();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 246;
                this.oC_StandaloneCall();
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_RegularQuery(): OC_RegularQueryContext {
        let localContext = new OC_RegularQueryContext(this.context, this.state);
        this.enterRule(localContext, 6, CypherParser.RULE_oC_RegularQuery);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 249;
            this.oC_SingleQuery();
            this.state = 256;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 6, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 251;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 250;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 253;
                    this.oC_Union();
                    }
                    }
                }
                this.state = 258;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 6, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Union(): OC_UnionContext {
        let localContext = new OC_UnionContext(this.context, this.state);
        this.enterRule(localContext, 8, CypherParser.RULE_oC_Union);
        let _la: number;
        try {
            this.state = 271;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 9, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 259;
                this.match(CypherParser.UNION);
                this.state = 260;
                this.match(CypherParser.SP);
                this.state = 261;
                this.match(CypherParser.ALL);
                this.state = 263;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 262;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 265;
                this.oC_SingleQuery();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 266;
                this.match(CypherParser.UNION);
                this.state = 268;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 267;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 270;
                this.oC_SingleQuery();
                }
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_SingleQuery(): OC_SingleQueryContext {
        let localContext = new OC_SingleQueryContext(this.context, this.state);
        this.enterRule(localContext, 10, CypherParser.RULE_oC_SingleQuery);
        try {
            this.state = 275;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 10, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 273;
                this.oC_SinglePartQuery();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 274;
                this.oC_MultiPartQuery();
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_SinglePartQuery(): OC_SinglePartQueryContext {
        let localContext = new OC_SinglePartQueryContext(this.context, this.state);
        this.enterRule(localContext, 12, CypherParser.RULE_oC_SinglePartQuery);
        let _la: number;
        try {
            let alternative: number;
            this.state = 330;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 23, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 283;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (((((_la - 53)) & ~0x1F) === 0 && ((1 << (_la - 53)) & 2055) !== 0)) {
                    {
                    {
                    this.state = 277;
                    this.oC_ReadingClause();
                    this.state = 279;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 278;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 285;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 286;
                this.oC_Return();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 293;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 14, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 287;
                        this.oC_ReadingClause();
                        this.state = 289;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 288;
                            this.match(CypherParser.SP);
                            }
                        }

                        }
                        }
                    }
                    this.state = 295;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 14, this.context);
                }
                this.state = 296;
                this.oC_UpdatingClause();
                this.state = 312;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 18, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 303;
                        this.errorHandler.sync(this);
                        alternative = this.interpreter.adaptivePredict(this.tokenStream, 16, this.context);
                        while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                            if (alternative === 1) {
                                {
                                {
                                this.state = 298;
                                this.errorHandler.sync(this);
                                _la = this.tokenStream.LA(1);
                                if (_la === 133) {
                                    {
                                    this.state = 297;
                                    this.match(CypherParser.SP);
                                    }
                                }

                                this.state = 300;
                                this.oC_ReadingClause();
                                }
                                }
                            }
                            this.state = 305;
                            this.errorHandler.sync(this);
                            alternative = this.interpreter.adaptivePredict(this.tokenStream, 16, this.context);
                        }
                        this.state = 307;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 306;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 309;
                        this.oC_UpdatingClause();
                        }
                        }
                    }
                    this.state = 314;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 18, this.context);
                }
                this.state = 328;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 22, this.context) ) {
                case 1:
                    {
                    this.state = 321;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 20, this.context);
                    while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                        if (alternative === 1) {
                            {
                            {
                            this.state = 316;
                            this.errorHandler.sync(this);
                            _la = this.tokenStream.LA(1);
                            if (_la === 133) {
                                {
                                this.state = 315;
                                this.match(CypherParser.SP);
                                }
                            }

                            this.state = 318;
                            this.oC_ReadingClause();
                            }
                            }
                        }
                        this.state = 323;
                        this.errorHandler.sync(this);
                        alternative = this.interpreter.adaptivePredict(this.tokenStream, 20, this.context);
                    }
                    this.state = 325;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 324;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 327;
                    this.oC_Return();
                    }
                    break;
                }
                }
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_MultiPartQuery(): OC_MultiPartQueryContext {
        let localContext = new OC_MultiPartQueryContext(this.context, this.state);
        this.enterRule(localContext, 14, CypherParser.RULE_oC_MultiPartQuery);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 348;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
                    this.state = 341;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (((((_la - 49)) & ~0x1F) === 0 && ((1 << (_la - 49)) & 64881) !== 0)) {
                        {
                        {
                        this.state = 334;
                        this.errorHandler.sync(this);
                        switch (this.interpreter.adaptivePredict(this.tokenStream, 24, this.context) ) {
                        case 1:
                            {
                            this.state = 332;
                            this.oC_ReadingClause();
                            }
                            break;
                        case 2:
                            {
                            this.state = 333;
                            this.oC_UpdatingClause();
                            }
                            break;
                        }
                        this.state = 337;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 336;
                            this.match(CypherParser.SP);
                            }
                        }

                        }
                        }
                        this.state = 343;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 344;
                    this.oC_With();
                    this.state = 346;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 345;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 350;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 28, this.context);
            } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
            this.state = 352;
            this.oC_SinglePartQuery();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_UpdatingClause(): OC_UpdatingClauseContext {
        let localContext = new OC_UpdatingClauseContext(this.context, this.state);
        this.enterRule(localContext, 16, CypherParser.RULE_oC_UpdatingClause);
        try {
            this.state = 361;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.CREATE:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 354;
                this.oC_Create();
                }
                break;
            case CypherParser.MERGE:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 355;
                this.oC_Merge();
                }
                break;
            case CypherParser.DETACH:
            case CypherParser.DELETE:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 356;
                this.oC_Delete();
                }
                break;
            case CypherParser.SET:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 357;
                this.oC_Set();
                }
                break;
            case CypherParser.REMOVE:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 358;
                this.oC_Remove();
                }
                break;
            case CypherParser.FOREACH:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 359;
                this.oC_Foreach();
                }
                break;
            case CypherParser.OPTIONAL:
            case CypherParser.CALL:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 360;
                this.oC_SubqueryCall();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Foreach(): OC_ForeachContext {
        let localContext = new OC_ForeachContext(this.context, this.state);
        this.enterRule(localContext, 18, CypherParser.RULE_oC_Foreach);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 363;
            this.match(CypherParser.FOREACH);
            this.state = 365;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 364;
                this.match(CypherParser.SP);
                }
            }

            this.state = 367;
            this.match(CypherParser.T__1);
            this.state = 369;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 368;
                this.match(CypherParser.SP);
                }
            }

            this.state = 371;
            this.oC_Variable();
            this.state = 372;
            this.match(CypherParser.SP);
            this.state = 373;
            this.match(CypherParser.IN);
            this.state = 374;
            this.match(CypherParser.SP);
            this.state = 375;
            this.oC_Expression();
            this.state = 377;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 376;
                this.match(CypherParser.SP);
                }
            }

            this.state = 379;
            this.match(CypherParser.T__2);
            this.state = 384;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
                    this.state = 381;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 380;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 383;
                    this.oC_UpdatingClause();
                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 386;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 34, this.context);
            } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
            this.state = 389;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 388;
                this.match(CypherParser.SP);
                }
            }

            this.state = 391;
            this.match(CypherParser.T__3);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ReadingClause(): OC_ReadingClauseContext {
        let localContext = new OC_ReadingClauseContext(this.context, this.state);
        this.enterRule(localContext, 20, CypherParser.RULE_oC_ReadingClause);
        try {
            this.state = 397;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 36, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 393;
                this.oC_Match();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 394;
                this.oC_Unwind();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 395;
                this.oC_SubqueryCall();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 396;
                this.oC_InQueryCall();
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_SubqueryCall(): OC_SubqueryCallContext {
        let localContext = new OC_SubqueryCallContext(this.context, this.state);
        this.enterRule(localContext, 22, CypherParser.RULE_oC_SubqueryCall);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 401;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 53) {
                {
                this.state = 399;
                this.match(CypherParser.OPTIONAL);
                this.state = 400;
                this.match(CypherParser.SP);
                }
            }

            this.state = 403;
            this.match(CypherParser.CALL);
            this.state = 405;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 404;
                this.match(CypherParser.SP);
                }
            }

            this.state = 435;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 2) {
                {
                this.state = 407;
                this.match(CypherParser.T__1);
                this.state = 409;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 39, this.context) ) {
                case 1:
                    {
                    this.state = 408;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 426;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case CypherParser.T__4:
                    {
                    this.state = 411;
                    this.match(CypherParser.T__4);
                    }
                    break;
                case CypherParser.UNION:
                case CypherParser.ALL:
                case CypherParser.FOREACH:
                case CypherParser.TRANSACTIONS:
                case CypherParser.ROWS:
                case CypherParser.ROW:
                case CypherParser.OPTIONAL:
                case CypherParser.MATCH:
                case CypherParser.UNWIND:
                case CypherParser.AS:
                case CypherParser.MERGE:
                case CypherParser.ON:
                case CypherParser.CREATE:
                case CypherParser.SET:
                case CypherParser.DETACH:
                case CypherParser.DELETE:
                case CypherParser.REMOVE:
                case CypherParser.CALL:
                case CypherParser.YIELD:
                case CypherParser.WITH:
                case CypherParser.RETURN:
                case CypherParser.DISTINCT:
                case CypherParser.ORDER:
                case CypherParser.BY:
                case CypherParser.L_SKIP:
                case CypherParser.LIMIT:
                case CypherParser.ASCENDING:
                case CypherParser.ASC:
                case CypherParser.DESCENDING:
                case CypherParser.DESC:
                case CypherParser.WHERE:
                case CypherParser.SHORTESTPATH:
                case CypherParser.ALLSHORTESTPATHS:
                case CypherParser.OR:
                case CypherParser.XOR:
                case CypherParser.AND:
                case CypherParser.NOT:
                case CypherParser.STARTS:
                case CypherParser.ENDS:
                case CypherParser.CONTAINS:
                case CypherParser.IN:
                case CypherParser.IS:
                case CypherParser.REDUCE:
                case CypherParser.COUNT:
                case CypherParser.CASE:
                case CypherParser.ELSE:
                case CypherParser.END:
                case CypherParser.WHEN:
                case CypherParser.THEN:
                case CypherParser.ANY:
                case CypherParser.NONE:
                case CypherParser.SINGLE:
                case CypherParser.EXISTS:
                case CypherParser.HexLetter:
                case CypherParser.CONSTRAINT:
                case CypherParser.DO:
                case CypherParser.FOR:
                case CypherParser.REQUIRE:
                case CypherParser.UNIQUE:
                case CypherParser.MANDATORY:
                case CypherParser.SCALAR:
                case CypherParser.OF:
                case CypherParser.ADD:
                case CypherParser.DROP:
                case CypherParser.FILTER:
                case CypherParser.EXTRACT:
                case CypherParser.UnescapedSymbolicName:
                case CypherParser.EscapedSymbolicName:
                    {
                    {
                    this.state = 412;
                    this.oC_Variable();
                    this.state = 423;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 42, this.context);
                    while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                        if (alternative === 1) {
                            {
                            {
                            this.state = 414;
                            this.errorHandler.sync(this);
                            _la = this.tokenStream.LA(1);
                            if (_la === 133) {
                                {
                                this.state = 413;
                                this.match(CypherParser.SP);
                                }
                            }

                            this.state = 416;
                            this.match(CypherParser.T__5);
                            this.state = 418;
                            this.errorHandler.sync(this);
                            _la = this.tokenStream.LA(1);
                            if (_la === 133) {
                                {
                                this.state = 417;
                                this.match(CypherParser.SP);
                                }
                            }

                            this.state = 420;
                            this.oC_Variable();
                            }
                            }
                        }
                        this.state = 425;
                        this.errorHandler.sync(this);
                        alternative = this.interpreter.adaptivePredict(this.tokenStream, 42, this.context);
                    }
                    }
                    }
                    break;
                case CypherParser.T__3:
                case CypherParser.SP:
                    break;
                default:
                    break;
                }
                this.state = 429;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 428;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 431;
                this.match(CypherParser.T__3);
                this.state = 433;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 432;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 437;
            this.match(CypherParser.T__6);
            this.state = 439;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 438;
                this.match(CypherParser.SP);
                }
            }

            this.state = 441;
            this.oC_RegularQuery();
            this.state = 443;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 442;
                this.match(CypherParser.SP);
                }
            }

            this.state = 445;
            this.match(CypherParser.T__7);
            this.state = 459;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 50, this.context) ) {
            case 1:
                {
                this.state = 446;
                this.match(CypherParser.SP);
                this.state = 447;
                this.match(CypherParser.IN);
                this.state = 448;
                this.match(CypherParser.SP);
                this.state = 449;
                this.match(CypherParser.TRANSACTIONS);
                this.state = 457;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 49, this.context) ) {
                case 1:
                    {
                    this.state = 450;
                    this.match(CypherParser.SP);
                    this.state = 451;
                    this.match(CypherParser.OF);
                    this.state = 452;
                    this.match(CypherParser.SP);
                    this.state = 453;
                    this.oC_Expression();
                    this.state = 454;
                    this.match(CypherParser.SP);
                    this.state = 455;
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 51 || _la === 52)) {
                    this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    }
                    break;
                }
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Match(): OC_MatchContext {
        let localContext = new OC_MatchContext(this.context, this.state);
        this.enterRule(localContext, 24, CypherParser.RULE_oC_Match);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 463;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 53) {
                {
                this.state = 461;
                this.match(CypherParser.OPTIONAL);
                this.state = 462;
                this.match(CypherParser.SP);
                }
            }

            this.state = 465;
            this.match(CypherParser.MATCH);
            this.state = 467;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 466;
                this.match(CypherParser.SP);
                }
            }

            this.state = 469;
            this.oC_Pattern();
            this.state = 474;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 54, this.context) ) {
            case 1:
                {
                this.state = 471;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 470;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 473;
                this.oC_Where();
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Unwind(): OC_UnwindContext {
        let localContext = new OC_UnwindContext(this.context, this.state);
        this.enterRule(localContext, 26, CypherParser.RULE_oC_Unwind);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 476;
            this.match(CypherParser.UNWIND);
            this.state = 478;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 477;
                this.match(CypherParser.SP);
                }
            }

            this.state = 480;
            this.oC_Expression();
            this.state = 481;
            this.match(CypherParser.SP);
            this.state = 482;
            this.match(CypherParser.AS);
            this.state = 483;
            this.match(CypherParser.SP);
            this.state = 484;
            this.oC_Variable();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Merge(): OC_MergeContext {
        let localContext = new OC_MergeContext(this.context, this.state);
        this.enterRule(localContext, 28, CypherParser.RULE_oC_Merge);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 486;
            this.match(CypherParser.MERGE);
            this.state = 488;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 487;
                this.match(CypherParser.SP);
                }
            }

            this.state = 490;
            this.oC_PatternPart();
            this.state = 495;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 57, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 491;
                    this.match(CypherParser.SP);
                    this.state = 492;
                    this.oC_MergeAction();
                    }
                    }
                }
                this.state = 497;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 57, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_MergeAction(): OC_MergeActionContext {
        let localContext = new OC_MergeActionContext(this.context, this.state);
        this.enterRule(localContext, 30, CypherParser.RULE_oC_MergeAction);
        try {
            this.state = 508;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 58, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 498;
                this.match(CypherParser.ON);
                this.state = 499;
                this.match(CypherParser.SP);
                this.state = 500;
                this.match(CypherParser.MATCH);
                this.state = 501;
                this.match(CypherParser.SP);
                this.state = 502;
                this.oC_Set();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 503;
                this.match(CypherParser.ON);
                this.state = 504;
                this.match(CypherParser.SP);
                this.state = 505;
                this.match(CypherParser.CREATE);
                this.state = 506;
                this.match(CypherParser.SP);
                this.state = 507;
                this.oC_Set();
                }
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Create(): OC_CreateContext {
        let localContext = new OC_CreateContext(this.context, this.state);
        this.enterRule(localContext, 32, CypherParser.RULE_oC_Create);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 510;
            this.match(CypherParser.CREATE);
            this.state = 512;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 511;
                this.match(CypherParser.SP);
                }
            }

            this.state = 514;
            this.oC_Pattern();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Set(): OC_SetContext {
        let localContext = new OC_SetContext(this.context, this.state);
        this.enterRule(localContext, 34, CypherParser.RULE_oC_Set);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 516;
            this.match(CypherParser.SET);
            this.state = 518;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 517;
                this.match(CypherParser.SP);
                }
            }

            this.state = 520;
            this.oC_SetItem();
            this.state = 531;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 63, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 522;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 521;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 524;
                    this.match(CypherParser.T__5);
                    this.state = 526;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 525;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 528;
                    this.oC_SetItem();
                    }
                    }
                }
                this.state = 533;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 63, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_SetItem(): OC_SetItemContext {
        let localContext = new OC_SetItemContext(this.context, this.state);
        this.enterRule(localContext, 36, CypherParser.RULE_oC_SetItem);
        let _la: number;
        try {
            this.state = 570;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 71, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 534;
                this.oC_PropertyExpression();
                this.state = 536;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 535;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 538;
                this.match(CypherParser.T__8);
                this.state = 540;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 539;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 542;
                this.oC_Expression();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 544;
                this.oC_Variable();
                this.state = 546;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 545;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 548;
                this.match(CypherParser.T__8);
                this.state = 550;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 549;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 552;
                this.oC_Expression();
                }
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 554;
                this.oC_Variable();
                this.state = 556;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 555;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 558;
                this.match(CypherParser.T__9);
                this.state = 560;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 559;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 562;
                this.oC_Expression();
                }
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                {
                this.state = 564;
                this.oC_Variable();
                this.state = 566;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 565;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 568;
                this.oC_NodeLabels();
                }
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Delete(): OC_DeleteContext {
        let localContext = new OC_DeleteContext(this.context, this.state);
        this.enterRule(localContext, 38, CypherParser.RULE_oC_Delete);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 574;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 61) {
                {
                this.state = 572;
                this.match(CypherParser.DETACH);
                this.state = 573;
                this.match(CypherParser.SP);
                }
            }

            this.state = 576;
            this.match(CypherParser.DELETE);
            this.state = 578;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 577;
                this.match(CypherParser.SP);
                }
            }

            this.state = 580;
            this.oC_Expression();
            this.state = 591;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 76, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 582;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 581;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 584;
                    this.match(CypherParser.T__5);
                    this.state = 586;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 585;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 588;
                    this.oC_Expression();
                    }
                    }
                }
                this.state = 593;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 76, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Remove(): OC_RemoveContext {
        let localContext = new OC_RemoveContext(this.context, this.state);
        this.enterRule(localContext, 40, CypherParser.RULE_oC_Remove);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 594;
            this.match(CypherParser.REMOVE);
            this.state = 595;
            this.match(CypherParser.SP);
            this.state = 596;
            this.oC_RemoveItem();
            this.state = 607;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 79, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 598;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 597;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 600;
                    this.match(CypherParser.T__5);
                    this.state = 602;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 601;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 604;
                    this.oC_RemoveItem();
                    }
                    }
                }
                this.state = 609;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 79, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_RemoveItem(): OC_RemoveItemContext {
        let localContext = new OC_RemoveItemContext(this.context, this.state);
        this.enterRule(localContext, 42, CypherParser.RULE_oC_RemoveItem);
        try {
            this.state = 614;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 80, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 610;
                this.oC_Variable();
                this.state = 611;
                this.oC_NodeLabels();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 613;
                this.oC_PropertyExpression();
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_InQueryCall(): OC_InQueryCallContext {
        let localContext = new OC_InQueryCallContext(this.context, this.state);
        this.enterRule(localContext, 44, CypherParser.RULE_oC_InQueryCall);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 616;
            this.match(CypherParser.CALL);
            this.state = 617;
            this.match(CypherParser.SP);
            this.state = 618;
            this.oC_ExplicitProcedureInvocation();
            this.state = 625;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 82, this.context) ) {
            case 1:
                {
                this.state = 620;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 619;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 622;
                this.match(CypherParser.YIELD);
                this.state = 623;
                this.match(CypherParser.SP);
                this.state = 624;
                this.oC_YieldItems();
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_StandaloneCall(): OC_StandaloneCallContext {
        let localContext = new OC_StandaloneCallContext(this.context, this.state);
        this.enterRule(localContext, 46, CypherParser.RULE_oC_StandaloneCall);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 627;
            this.match(CypherParser.CALL);
            this.state = 628;
            this.match(CypherParser.SP);
            this.state = 631;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 83, this.context) ) {
            case 1:
                {
                this.state = 629;
                this.oC_ExplicitProcedureInvocation();
                }
                break;
            case 2:
                {
                this.state = 630;
                this.oC_ImplicitProcedureInvocation();
                }
                break;
            }
            this.state = 642;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 86, this.context) ) {
            case 1:
                {
                this.state = 634;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 633;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 636;
                this.match(CypherParser.YIELD);
                this.state = 637;
                this.match(CypherParser.SP);
                this.state = 640;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case CypherParser.T__4:
                    {
                    this.state = 638;
                    this.match(CypherParser.T__4);
                    }
                    break;
                case CypherParser.UNION:
                case CypherParser.ALL:
                case CypherParser.FOREACH:
                case CypherParser.TRANSACTIONS:
                case CypherParser.ROWS:
                case CypherParser.ROW:
                case CypherParser.OPTIONAL:
                case CypherParser.MATCH:
                case CypherParser.UNWIND:
                case CypherParser.AS:
                case CypherParser.MERGE:
                case CypherParser.ON:
                case CypherParser.CREATE:
                case CypherParser.SET:
                case CypherParser.DETACH:
                case CypherParser.DELETE:
                case CypherParser.REMOVE:
                case CypherParser.CALL:
                case CypherParser.YIELD:
                case CypherParser.WITH:
                case CypherParser.RETURN:
                case CypherParser.DISTINCT:
                case CypherParser.ORDER:
                case CypherParser.BY:
                case CypherParser.L_SKIP:
                case CypherParser.LIMIT:
                case CypherParser.ASCENDING:
                case CypherParser.ASC:
                case CypherParser.DESCENDING:
                case CypherParser.DESC:
                case CypherParser.WHERE:
                case CypherParser.SHORTESTPATH:
                case CypherParser.ALLSHORTESTPATHS:
                case CypherParser.OR:
                case CypherParser.XOR:
                case CypherParser.AND:
                case CypherParser.NOT:
                case CypherParser.STARTS:
                case CypherParser.ENDS:
                case CypherParser.CONTAINS:
                case CypherParser.IN:
                case CypherParser.IS:
                case CypherParser.REDUCE:
                case CypherParser.COUNT:
                case CypherParser.CASE:
                case CypherParser.ELSE:
                case CypherParser.END:
                case CypherParser.WHEN:
                case CypherParser.THEN:
                case CypherParser.ANY:
                case CypherParser.NONE:
                case CypherParser.SINGLE:
                case CypherParser.EXISTS:
                case CypherParser.HexLetter:
                case CypherParser.CONSTRAINT:
                case CypherParser.DO:
                case CypherParser.FOR:
                case CypherParser.REQUIRE:
                case CypherParser.UNIQUE:
                case CypherParser.MANDATORY:
                case CypherParser.SCALAR:
                case CypherParser.OF:
                case CypherParser.ADD:
                case CypherParser.DROP:
                case CypherParser.FILTER:
                case CypherParser.EXTRACT:
                case CypherParser.UnescapedSymbolicName:
                case CypherParser.EscapedSymbolicName:
                    {
                    this.state = 639;
                    this.oC_YieldItems();
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_YieldItems(): OC_YieldItemsContext {
        let localContext = new OC_YieldItemsContext(this.context, this.state);
        this.enterRule(localContext, 48, CypherParser.RULE_oC_YieldItems);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 644;
            this.oC_YieldItem();
            this.state = 655;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 89, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 646;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 645;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 648;
                    this.match(CypherParser.T__5);
                    this.state = 650;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 649;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 652;
                    this.oC_YieldItem();
                    }
                    }
                }
                this.state = 657;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 89, this.context);
            }
            this.state = 662;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 91, this.context) ) {
            case 1:
                {
                this.state = 659;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 658;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 661;
                this.oC_Where();
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_YieldItem(): OC_YieldItemContext {
        let localContext = new OC_YieldItemContext(this.context, this.state);
        this.enterRule(localContext, 50, CypherParser.RULE_oC_YieldItem);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 669;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 92, this.context) ) {
            case 1:
                {
                this.state = 664;
                this.oC_ProcedureResultField();
                this.state = 665;
                this.match(CypherParser.SP);
                this.state = 666;
                this.match(CypherParser.AS);
                this.state = 667;
                this.match(CypherParser.SP);
                }
                break;
            }
            this.state = 671;
            this.oC_Variable();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_With(): OC_WithContext {
        let localContext = new OC_WithContext(this.context, this.state);
        this.enterRule(localContext, 52, CypherParser.RULE_oC_With);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 673;
            this.match(CypherParser.WITH);
            this.state = 674;
            this.oC_ProjectionBody();
            this.state = 679;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 94, this.context) ) {
            case 1:
                {
                this.state = 676;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 675;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 678;
                this.oC_Where();
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Return(): OC_ReturnContext {
        let localContext = new OC_ReturnContext(this.context, this.state);
        this.enterRule(localContext, 54, CypherParser.RULE_oC_Return);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 681;
            this.match(CypherParser.RETURN);
            this.state = 682;
            this.oC_ProjectionBody();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ProjectionBody(): OC_ProjectionBodyContext {
        let localContext = new OC_ProjectionBodyContext(this.context, this.state);
        this.enterRule(localContext, 56, CypherParser.RULE_oC_ProjectionBody);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 688;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 96, this.context) ) {
            case 1:
                {
                this.state = 685;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 684;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 687;
                this.match(CypherParser.DISTINCT);
                }
                break;
            }
            this.state = 690;
            this.match(CypherParser.SP);
            this.state = 691;
            this.oC_ProjectionItems();
            this.state = 694;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 97, this.context) ) {
            case 1:
                {
                this.state = 692;
                this.match(CypherParser.SP);
                this.state = 693;
                this.oC_Order();
                }
                break;
            }
            this.state = 698;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 98, this.context) ) {
            case 1:
                {
                this.state = 696;
                this.match(CypherParser.SP);
                this.state = 697;
                this.oC_Skip();
                }
                break;
            }
            this.state = 702;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 99, this.context) ) {
            case 1:
                {
                this.state = 700;
                this.match(CypherParser.SP);
                this.state = 701;
                this.oC_Limit();
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ProjectionItems(): OC_ProjectionItemsContext {
        let localContext = new OC_ProjectionItemsContext(this.context, this.state);
        this.enterRule(localContext, 58, CypherParser.RULE_oC_ProjectionItems);
        let _la: number;
        try {
            let alternative: number;
            this.state = 732;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__4:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 704;
                this.match(CypherParser.T__4);
                this.state = 715;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 102, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 706;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 705;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 708;
                        this.match(CypherParser.T__5);
                        this.state = 710;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 709;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 712;
                        this.oC_ProjectionItem();
                        }
                        }
                    }
                    this.state = 717;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 102, this.context);
                }
                }
                }
                break;
            case CypherParser.T__1:
            case CypherParser.T__6:
            case CypherParser.T__10:
            case CypherParser.T__11:
            case CypherParser.T__21:
            case CypherParser.T__26:
            case CypherParser.UNION:
            case CypherParser.ALL:
            case CypherParser.FOREACH:
            case CypherParser.TRANSACTIONS:
            case CypherParser.ROWS:
            case CypherParser.ROW:
            case CypherParser.OPTIONAL:
            case CypherParser.MATCH:
            case CypherParser.UNWIND:
            case CypherParser.AS:
            case CypherParser.MERGE:
            case CypherParser.ON:
            case CypherParser.CREATE:
            case CypherParser.SET:
            case CypherParser.DETACH:
            case CypherParser.DELETE:
            case CypherParser.REMOVE:
            case CypherParser.CALL:
            case CypherParser.YIELD:
            case CypherParser.WITH:
            case CypherParser.RETURN:
            case CypherParser.DISTINCT:
            case CypherParser.ORDER:
            case CypherParser.BY:
            case CypherParser.L_SKIP:
            case CypherParser.LIMIT:
            case CypherParser.ASCENDING:
            case CypherParser.ASC:
            case CypherParser.DESCENDING:
            case CypherParser.DESC:
            case CypherParser.WHERE:
            case CypherParser.SHORTESTPATH:
            case CypherParser.ALLSHORTESTPATHS:
            case CypherParser.OR:
            case CypherParser.XOR:
            case CypherParser.AND:
            case CypherParser.NOT:
            case CypherParser.STARTS:
            case CypherParser.ENDS:
            case CypherParser.CONTAINS:
            case CypherParser.IN:
            case CypherParser.IS:
            case CypherParser.NULL:
            case CypherParser.REDUCE:
            case CypherParser.COUNT:
            case CypherParser.CASE:
            case CypherParser.ELSE:
            case CypherParser.END:
            case CypherParser.WHEN:
            case CypherParser.THEN:
            case CypherParser.ANY:
            case CypherParser.NONE:
            case CypherParser.SINGLE:
            case CypherParser.EXISTS:
            case CypherParser.TRUE:
            case CypherParser.FALSE:
            case CypherParser.HexInteger:
            case CypherParser.DecimalInteger:
            case CypherParser.OctalInteger:
            case CypherParser.HexLetter:
            case CypherParser.ExponentDecimalReal:
            case CypherParser.RegularDecimalReal:
            case CypherParser.StringLiteral:
            case CypherParser.CONSTRAINT:
            case CypherParser.DO:
            case CypherParser.FOR:
            case CypherParser.REQUIRE:
            case CypherParser.UNIQUE:
            case CypherParser.MANDATORY:
            case CypherParser.SCALAR:
            case CypherParser.OF:
            case CypherParser.ADD:
            case CypherParser.DROP:
            case CypherParser.FILTER:
            case CypherParser.EXTRACT:
            case CypherParser.UnescapedSymbolicName:
            case CypherParser.EscapedSymbolicName:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 718;
                this.oC_ProjectionItem();
                this.state = 729;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 105, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 720;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 719;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 722;
                        this.match(CypherParser.T__5);
                        this.state = 724;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 723;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 726;
                        this.oC_ProjectionItem();
                        }
                        }
                    }
                    this.state = 731;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 105, this.context);
                }
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ProjectionItem(): OC_ProjectionItemContext {
        let localContext = new OC_ProjectionItemContext(this.context, this.state);
        this.enterRule(localContext, 60, CypherParser.RULE_oC_ProjectionItem);
        try {
            this.state = 741;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 107, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 734;
                this.oC_Expression();
                this.state = 735;
                this.match(CypherParser.SP);
                this.state = 736;
                this.match(CypherParser.AS);
                this.state = 737;
                this.match(CypherParser.SP);
                this.state = 738;
                this.oC_Variable();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 740;
                this.oC_Expression();
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Order(): OC_OrderContext {
        let localContext = new OC_OrderContext(this.context, this.state);
        this.enterRule(localContext, 62, CypherParser.RULE_oC_Order);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 743;
            this.match(CypherParser.ORDER);
            this.state = 744;
            this.match(CypherParser.SP);
            this.state = 745;
            this.match(CypherParser.BY);
            this.state = 746;
            this.match(CypherParser.SP);
            this.state = 747;
            this.oC_SortItem();
            this.state = 755;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 6) {
                {
                {
                this.state = 748;
                this.match(CypherParser.T__5);
                this.state = 750;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 749;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 752;
                this.oC_SortItem();
                }
                }
                this.state = 757;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Skip(): OC_SkipContext {
        let localContext = new OC_SkipContext(this.context, this.state);
        this.enterRule(localContext, 64, CypherParser.RULE_oC_Skip);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 758;
            this.match(CypherParser.L_SKIP);
            this.state = 759;
            this.match(CypherParser.SP);
            this.state = 760;
            this.oC_Expression();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Limit(): OC_LimitContext {
        let localContext = new OC_LimitContext(this.context, this.state);
        this.enterRule(localContext, 66, CypherParser.RULE_oC_Limit);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 762;
            this.match(CypherParser.LIMIT);
            this.state = 763;
            this.match(CypherParser.SP);
            this.state = 764;
            this.oC_Expression();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_SortItem(): OC_SortItemContext {
        let localContext = new OC_SortItemContext(this.context, this.state);
        this.enterRule(localContext, 68, CypherParser.RULE_oC_SortItem);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 766;
            this.oC_Expression();
            this.state = 771;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 111, this.context) ) {
            case 1:
                {
                this.state = 768;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 767;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 770;
                _la = this.tokenStream.LA(1);
                if(!(((((_la - 73)) & ~0x1F) === 0 && ((1 << (_la - 73)) & 15) !== 0))) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Where(): OC_WhereContext {
        let localContext = new OC_WhereContext(this.context, this.state);
        this.enterRule(localContext, 70, CypherParser.RULE_oC_Where);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 773;
            this.match(CypherParser.WHERE);
            this.state = 774;
            this.match(CypherParser.SP);
            this.state = 775;
            this.oC_Expression();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Pattern(): OC_PatternContext {
        let localContext = new OC_PatternContext(this.context, this.state);
        this.enterRule(localContext, 72, CypherParser.RULE_oC_Pattern);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 777;
            this.oC_PatternPart();
            this.state = 788;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 114, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 779;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 778;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 781;
                    this.match(CypherParser.T__5);
                    this.state = 783;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 782;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 785;
                    this.oC_PatternPart();
                    }
                    }
                }
                this.state = 790;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 114, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_PatternPart(): OC_PatternPartContext {
        let localContext = new OC_PatternPartContext(this.context, this.state);
        this.enterRule(localContext, 74, CypherParser.RULE_oC_PatternPart);
        let _la: number;
        try {
            this.state = 802;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 117, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 791;
                this.oC_Variable();
                this.state = 793;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 792;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 795;
                this.match(CypherParser.T__8);
                this.state = 797;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 796;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 799;
                this.oC_AnonymousPatternPart();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 801;
                this.oC_AnonymousPatternPart();
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_AnonymousPatternPart(): OC_AnonymousPatternPartContext {
        let localContext = new OC_AnonymousPatternPartContext(this.context, this.state);
        this.enterRule(localContext, 76, CypherParser.RULE_oC_AnonymousPatternPart);
        try {
            this.state = 806;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.SHORTESTPATH:
            case CypherParser.ALLSHORTESTPATHS:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 804;
                this.oC_ShortestPathPattern();
                }
                break;
            case CypherParser.T__1:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 805;
                this.oC_PatternElement();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ShortestPathPattern(): OC_ShortestPathPatternContext {
        let localContext = new OC_ShortestPathPatternContext(this.context, this.state);
        this.enterRule(localContext, 78, CypherParser.RULE_oC_ShortestPathPattern);
        let _la: number;
        try {
            this.state = 836;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.SHORTESTPATH:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 808;
                this.match(CypherParser.SHORTESTPATH);
                this.state = 810;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 809;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 812;
                this.match(CypherParser.T__1);
                this.state = 814;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 813;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 816;
                this.oC_PatternElement();
                this.state = 818;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 817;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 820;
                this.match(CypherParser.T__3);
                }
                }
                break;
            case CypherParser.ALLSHORTESTPATHS:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 822;
                this.match(CypherParser.ALLSHORTESTPATHS);
                this.state = 824;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 823;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 826;
                this.match(CypherParser.T__1);
                this.state = 828;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 827;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 830;
                this.oC_PatternElement();
                this.state = 832;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 831;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 834;
                this.match(CypherParser.T__3);
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_PatternElement(): OC_PatternElementContext {
        let localContext = new OC_PatternElementContext(this.context, this.state);
        this.enterRule(localContext, 80, CypherParser.RULE_oC_PatternElement);
        let _la: number;
        try {
            let alternative: number;
            this.state = 859;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 130, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 840;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 126, this.context) ) {
                case 1:
                    {
                    this.state = 838;
                    this.oC_NodePattern();
                    }
                    break;
                case 2:
                    {
                    this.state = 839;
                    this.oC_QuantifiedPathPattern();
                    }
                    break;
                }
                this.state = 852;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 129, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 843;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 842;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 848;
                        this.errorHandler.sync(this);
                        switch (this.interpreter.adaptivePredict(this.tokenStream, 128, this.context) ) {
                        case 1:
                            {
                            this.state = 845;
                            this.oC_PatternElementChain();
                            }
                            break;
                        case 2:
                            {
                            this.state = 846;
                            this.oC_QuantifiedPathPattern();
                            }
                            break;
                        case 3:
                            {
                            this.state = 847;
                            this.oC_NodePattern();
                            }
                            break;
                        }
                        }
                        }
                    }
                    this.state = 854;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 129, this.context);
                }
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 855;
                this.match(CypherParser.T__1);
                this.state = 856;
                this.oC_PatternElement();
                this.state = 857;
                this.match(CypherParser.T__3);
                }
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_QuantifiedPathPattern(): OC_QuantifiedPathPatternContext {
        let localContext = new OC_QuantifiedPathPatternContext(this.context, this.state);
        this.enterRule(localContext, 82, CypherParser.RULE_oC_QuantifiedPathPattern);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 861;
            this.match(CypherParser.T__1);
            this.state = 863;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 862;
                this.match(CypherParser.SP);
                }
            }

            this.state = 865;
            this.oC_PatternElement();
            this.state = 870;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 133, this.context) ) {
            case 1:
                {
                this.state = 867;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 866;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 869;
                this.oC_Where();
                }
                break;
            }
            this.state = 873;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 872;
                this.match(CypherParser.SP);
                }
            }

            this.state = 875;
            this.match(CypherParser.T__3);
            this.state = 877;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 876;
                this.match(CypherParser.SP);
                }
            }

            this.state = 879;
            this.oC_PathQuantifier();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_RelationshipsPattern(): OC_RelationshipsPatternContext {
        let localContext = new OC_RelationshipsPatternContext(this.context, this.state);
        this.enterRule(localContext, 84, CypherParser.RULE_oC_RelationshipsPattern);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 881;
            this.oC_NodePattern();
            this.state = 886;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
                    this.state = 883;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 882;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 885;
                    this.oC_PatternElementChain();
                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 888;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 137, this.context);
            } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_NodePattern(): OC_NodePatternContext {
        let localContext = new OC_NodePatternContext(this.context, this.state);
        this.enterRule(localContext, 86, CypherParser.RULE_oC_NodePattern);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 890;
            this.match(CypherParser.T__1);
            this.state = 892;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 891;
                this.match(CypherParser.SP);
                }
            }

            this.state = 898;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294967295) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 138411007) !== 0) || ((((_la - 117)) & ~0x1F) === 0 && ((1 << (_la - 117)) & 40959) !== 0)) {
                {
                this.state = 894;
                this.oC_Variable();
                this.state = 896;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 895;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 904;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 14) {
                {
                this.state = 900;
                this.oC_NodeLabels();
                this.state = 902;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 901;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 910;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 7 || _la === 27) {
                {
                this.state = 906;
                this.oC_Properties();
                this.state = 908;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 907;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 912;
            this.match(CypherParser.T__3);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_PatternElementChain(): OC_PatternElementChainContext {
        let localContext = new OC_PatternElementChainContext(this.context, this.state);
        this.enterRule(localContext, 88, CypherParser.RULE_oC_PatternElementChain);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 914;
            this.oC_RelationshipPattern();
            this.state = 919;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 146, this.context) ) {
            case 1:
                {
                this.state = 916;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 915;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 918;
                this.oC_PathQuantifier();
                }
                break;
            }
            this.state = 922;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 921;
                this.match(CypherParser.SP);
                }
            }

            this.state = 924;
            this.oC_NodePattern();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_PathQuantifier(): OC_PathQuantifierContext {
        let localContext = new OC_PathQuantifierContext(this.context, this.state);
        this.enterRule(localContext, 90, CypherParser.RULE_oC_PathQuantifier);
        let _la: number;
        try {
            this.state = 951;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__10:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 926;
                this.match(CypherParser.T__10);
                }
                break;
            case CypherParser.T__4:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 927;
                this.match(CypherParser.T__4);
                }
                break;
            case CypherParser.T__6:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 928;
                this.match(CypherParser.T__6);
                this.state = 930;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 148, this.context) ) {
                case 1:
                    {
                    this.state = 929;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 933;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0)) {
                    {
                    this.state = 932;
                    this.oC_IntegerLiteral();
                    }
                }

                this.state = 936;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 935;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 948;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 6) {
                    {
                    this.state = 938;
                    this.match(CypherParser.T__5);
                    this.state = 940;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 151, this.context) ) {
                    case 1:
                        {
                        this.state = 939;
                        this.match(CypherParser.SP);
                        }
                        break;
                    }
                    this.state = 943;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0)) {
                        {
                        this.state = 942;
                        this.oC_IntegerLiteral();
                        }
                    }

                    this.state = 946;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 945;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                }

                this.state = 950;
                this.match(CypherParser.T__7);
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_RelationshipPattern(): OC_RelationshipPatternContext {
        let localContext = new OC_RelationshipPatternContext(this.context, this.state);
        this.enterRule(localContext, 92, CypherParser.RULE_oC_RelationshipPattern);
        let _la: number;
        try {
            this.state = 1017;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 172, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 953;
                this.oC_LeftArrowHead();
                this.state = 955;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 954;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 957;
                this.oC_Dash();
                this.state = 959;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 157, this.context) ) {
                case 1:
                    {
                    this.state = 958;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 962;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 961;
                    this.oC_RelationshipDetail();
                    }
                }

                this.state = 965;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 964;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 967;
                this.oC_Dash();
                this.state = 969;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 968;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 971;
                this.oC_RightArrowHead();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 973;
                this.oC_LeftArrowHead();
                this.state = 975;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 974;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 977;
                this.oC_Dash();
                this.state = 979;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 162, this.context) ) {
                case 1:
                    {
                    this.state = 978;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 982;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 981;
                    this.oC_RelationshipDetail();
                    }
                }

                this.state = 985;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 984;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 987;
                this.oC_Dash();
                }
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 989;
                this.oC_Dash();
                this.state = 991;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 165, this.context) ) {
                case 1:
                    {
                    this.state = 990;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 994;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 993;
                    this.oC_RelationshipDetail();
                    }
                }

                this.state = 997;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 996;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 999;
                this.oC_Dash();
                this.state = 1001;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1000;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1003;
                this.oC_RightArrowHead();
                }
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                {
                this.state = 1005;
                this.oC_Dash();
                this.state = 1007;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 169, this.context) ) {
                case 1:
                    {
                    this.state = 1006;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 1010;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 1009;
                    this.oC_RelationshipDetail();
                    }
                }

                this.state = 1013;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1012;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1015;
                this.oC_Dash();
                }
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_RelationshipDetail(): OC_RelationshipDetailContext {
        let localContext = new OC_RelationshipDetailContext(this.context, this.state);
        this.enterRule(localContext, 94, CypherParser.RULE_oC_RelationshipDetail);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1019;
            this.match(CypherParser.T__11);
            this.state = 1021;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1020;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1027;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294967295) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 138411007) !== 0) || ((((_la - 117)) & ~0x1F) === 0 && ((1 << (_la - 117)) & 40959) !== 0)) {
                {
                this.state = 1023;
                this.oC_Variable();
                this.state = 1025;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1024;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1033;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 14) {
                {
                this.state = 1029;
                this.oC_RelationshipTypes();
                this.state = 1031;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1030;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1036;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 5) {
                {
                this.state = 1035;
                this.oC_RangeLiteral();
                }
            }

            this.state = 1042;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 7 || _la === 27) {
                {
                this.state = 1038;
                this.oC_Properties();
                this.state = 1040;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1039;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1044;
            this.match(CypherParser.T__12);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Properties(): OC_PropertiesContext {
        let localContext = new OC_PropertiesContext(this.context, this.state);
        this.enterRule(localContext, 96, CypherParser.RULE_oC_Properties);
        try {
            this.state = 1048;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__6:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1046;
                this.oC_MapLiteral();
                }
                break;
            case CypherParser.T__26:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1047;
                this.oC_Parameter();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_RelationshipTypes(): OC_RelationshipTypesContext {
        let localContext = new OC_RelationshipTypesContext(this.context, this.state);
        this.enterRule(localContext, 98, CypherParser.RULE_oC_RelationshipTypes);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1050;
            this.match(CypherParser.T__13);
            this.state = 1052;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1051;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1054;
            this.oC_RelTypeName();
            this.state = 1068;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 186, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1056;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1055;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1058;
                    this.match(CypherParser.T__2);
                    this.state = 1060;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 14) {
                        {
                        this.state = 1059;
                        this.match(CypherParser.T__13);
                        }
                    }

                    this.state = 1063;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1062;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1065;
                    this.oC_RelTypeName();
                    }
                    }
                }
                this.state = 1070;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 186, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_NodeLabels(): OC_NodeLabelsContext {
        let localContext = new OC_NodeLabelsContext(this.context, this.state);
        this.enterRule(localContext, 100, CypherParser.RULE_oC_NodeLabels);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1071;
            this.oC_NodeLabel();
            this.state = 1078;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 188, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1073;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1072;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1075;
                    this.oC_NodeLabel();
                    }
                    }
                }
                this.state = 1080;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 188, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_NodeLabel(): OC_NodeLabelContext {
        let localContext = new OC_NodeLabelContext(this.context, this.state);
        this.enterRule(localContext, 102, CypherParser.RULE_oC_NodeLabel);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1081;
            this.match(CypherParser.T__13);
            this.state = 1083;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1082;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1085;
            this.oC_LabelName();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_RangeLiteral(): OC_RangeLiteralContext {
        let localContext = new OC_RangeLiteralContext(this.context, this.state);
        this.enterRule(localContext, 104, CypherParser.RULE_oC_RangeLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1087;
            this.match(CypherParser.T__4);
            this.state = 1089;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1088;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1095;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0)) {
                {
                this.state = 1091;
                this.oC_IntegerLiteral();
                this.state = 1093;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1092;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1107;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 15) {
                {
                this.state = 1097;
                this.match(CypherParser.T__14);
                this.state = 1099;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1098;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1105;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0)) {
                    {
                    this.state = 1101;
                    this.oC_IntegerLiteral();
                    this.state = 1103;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1102;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                }

                }
            }

            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_LabelName(): OC_LabelNameContext {
        let localContext = new OC_LabelNameContext(this.context, this.state);
        this.enterRule(localContext, 106, CypherParser.RULE_oC_LabelName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1109;
            this.oC_SchemaName();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_RelTypeName(): OC_RelTypeNameContext {
        let localContext = new OC_RelTypeNameContext(this.context, this.state);
        this.enterRule(localContext, 108, CypherParser.RULE_oC_RelTypeName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1111;
            this.oC_SchemaName();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_PropertyExpression(): OC_PropertyExpressionContext {
        let localContext = new OC_PropertyExpressionContext(this.context, this.state);
        this.enterRule(localContext, 110, CypherParser.RULE_oC_PropertyExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1113;
            this.oC_Atom();
            this.state = 1118;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
                    this.state = 1115;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1114;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1117;
                    this.oC_PropertyLookup();
                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 1120;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 198, this.context);
            } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Expression(): OC_ExpressionContext {
        let localContext = new OC_ExpressionContext(this.context, this.state);
        this.enterRule(localContext, 112, CypherParser.RULE_oC_Expression);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1122;
            this.oC_OrExpression();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_OrExpression(): OC_OrExpressionContext {
        let localContext = new OC_OrExpressionContext(this.context, this.state);
        this.enterRule(localContext, 114, CypherParser.RULE_oC_OrExpression);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1124;
            this.oC_XorExpression();
            this.state = 1131;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 199, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1125;
                    this.match(CypherParser.SP);
                    this.state = 1126;
                    this.match(CypherParser.OR);
                    this.state = 1127;
                    this.match(CypherParser.SP);
                    this.state = 1128;
                    this.oC_XorExpression();
                    }
                    }
                }
                this.state = 1133;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 199, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_XorExpression(): OC_XorExpressionContext {
        let localContext = new OC_XorExpressionContext(this.context, this.state);
        this.enterRule(localContext, 116, CypherParser.RULE_oC_XorExpression);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1134;
            this.oC_AndExpression();
            this.state = 1141;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 200, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1135;
                    this.match(CypherParser.SP);
                    this.state = 1136;
                    this.match(CypherParser.XOR);
                    this.state = 1137;
                    this.match(CypherParser.SP);
                    this.state = 1138;
                    this.oC_AndExpression();
                    }
                    }
                }
                this.state = 1143;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 200, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_AndExpression(): OC_AndExpressionContext {
        let localContext = new OC_AndExpressionContext(this.context, this.state);
        this.enterRule(localContext, 118, CypherParser.RULE_oC_AndExpression);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1144;
            this.oC_NotExpression();
            this.state = 1151;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 201, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1145;
                    this.match(CypherParser.SP);
                    this.state = 1146;
                    this.match(CypherParser.AND);
                    this.state = 1147;
                    this.match(CypherParser.SP);
                    this.state = 1148;
                    this.oC_NotExpression();
                    }
                    }
                }
                this.state = 1153;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 201, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_NotExpression(): OC_NotExpressionContext {
        let localContext = new OC_NotExpressionContext(this.context, this.state);
        this.enterRule(localContext, 120, CypherParser.RULE_oC_NotExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1160;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 203, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1154;
                    this.match(CypherParser.NOT);
                    this.state = 1156;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1155;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                }
                this.state = 1162;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 203, this.context);
            }
            this.state = 1163;
            this.oC_ComparisonExpression();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ComparisonExpression(): OC_ComparisonExpressionContext {
        let localContext = new OC_ComparisonExpressionContext(this.context, this.state);
        this.enterRule(localContext, 122, CypherParser.RULE_oC_ComparisonExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1165;
            this.oC_StringListNullPredicateExpression();
            this.state = 1172;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 205, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1167;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1166;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1169;
                    this.oC_PartialComparisonExpression();
                    }
                    }
                }
                this.state = 1174;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 205, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_PartialComparisonExpression(): OC_PartialComparisonExpressionContext {
        let localContext = new OC_PartialComparisonExpressionContext(this.context, this.state);
        this.enterRule(localContext, 124, CypherParser.RULE_oC_PartialComparisonExpression);
        let _la: number;
        try {
            this.state = 1205;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__8:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1175;
                this.match(CypherParser.T__8);
                this.state = 1177;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1176;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1179;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__15:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1180;
                this.match(CypherParser.T__15);
                this.state = 1182;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1181;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1184;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__16:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 1185;
                this.match(CypherParser.T__16);
                this.state = 1187;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1186;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1189;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__17:
                this.enterOuterAlt(localContext, 4);
                {
                {
                this.state = 1190;
                this.match(CypherParser.T__17);
                this.state = 1192;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1191;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1194;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__18:
                this.enterOuterAlt(localContext, 5);
                {
                {
                this.state = 1195;
                this.match(CypherParser.T__18);
                this.state = 1197;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1196;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1199;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__19:
                this.enterOuterAlt(localContext, 6);
                {
                {
                this.state = 1200;
                this.match(CypherParser.T__19);
                this.state = 1202;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1201;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1204;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_StringListNullPredicateExpression(): OC_StringListNullPredicateExpressionContext {
        let localContext = new OC_StringListNullPredicateExpressionContext(this.context, this.state);
        this.enterRule(localContext, 126, CypherParser.RULE_oC_StringListNullPredicateExpression);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1207;
            this.oC_AddOrSubtractExpression();
            this.state = 1213;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 214, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    this.state = 1211;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 213, this.context) ) {
                    case 1:
                        {
                        this.state = 1208;
                        this.oC_StringPredicateExpression();
                        }
                        break;
                    case 2:
                        {
                        this.state = 1209;
                        this.oC_ListPredicateExpression();
                        }
                        break;
                    case 3:
                        {
                        this.state = 1210;
                        this.oC_NullPredicateExpression();
                        }
                        break;
                    }
                    }
                }
                this.state = 1215;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 214, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_StringPredicateExpression(): OC_StringPredicateExpressionContext {
        let localContext = new OC_StringPredicateExpressionContext(this.context, this.state);
        this.enterRule(localContext, 128, CypherParser.RULE_oC_StringPredicateExpression);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1230;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 216, this.context) ) {
            case 1:
                {
                {
                this.state = 1216;
                this.match(CypherParser.SP);
                this.state = 1217;
                this.match(CypherParser.STARTS);
                this.state = 1218;
                this.match(CypherParser.SP);
                this.state = 1219;
                this.match(CypherParser.WITH);
                }
                }
                break;
            case 2:
                {
                {
                this.state = 1220;
                this.match(CypherParser.SP);
                this.state = 1221;
                this.match(CypherParser.ENDS);
                this.state = 1222;
                this.match(CypherParser.SP);
                this.state = 1223;
                this.match(CypherParser.WITH);
                }
                }
                break;
            case 3:
                {
                {
                this.state = 1224;
                this.match(CypherParser.SP);
                this.state = 1225;
                this.match(CypherParser.CONTAINS);
                }
                }
                break;
            case 4:
                {
                {
                this.state = 1227;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1226;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1229;
                this.match(CypherParser.T__20);
                }
                }
                break;
            }
            this.state = 1233;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1232;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1235;
            this.oC_AddOrSubtractExpression();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ListPredicateExpression(): OC_ListPredicateExpressionContext {
        let localContext = new OC_ListPredicateExpressionContext(this.context, this.state);
        this.enterRule(localContext, 130, CypherParser.RULE_oC_ListPredicateExpression);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1237;
            this.match(CypherParser.SP);
            this.state = 1238;
            this.match(CypherParser.IN);
            this.state = 1240;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1239;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1242;
            this.oC_AddOrSubtractExpression();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_NullPredicateExpression(): OC_NullPredicateExpressionContext {
        let localContext = new OC_NullPredicateExpressionContext(this.context, this.state);
        this.enterRule(localContext, 132, CypherParser.RULE_oC_NullPredicateExpression);
        try {
            this.state = 1254;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 219, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1244;
                this.match(CypherParser.SP);
                this.state = 1245;
                this.match(CypherParser.IS);
                this.state = 1246;
                this.match(CypherParser.SP);
                this.state = 1247;
                this.match(CypherParser.NULL);
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1248;
                this.match(CypherParser.SP);
                this.state = 1249;
                this.match(CypherParser.IS);
                this.state = 1250;
                this.match(CypherParser.SP);
                this.state = 1251;
                this.match(CypherParser.NOT);
                this.state = 1252;
                this.match(CypherParser.SP);
                this.state = 1253;
                this.match(CypherParser.NULL);
                }
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_AddOrSubtractExpression(): OC_AddOrSubtractExpressionContext {
        let localContext = new OC_AddOrSubtractExpressionContext(this.context, this.state);
        this.enterRule(localContext, 134, CypherParser.RULE_oC_AddOrSubtractExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1256;
            this.oC_MultiplyDivideModuloExpression();
            this.state = 1275;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 225, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    this.state = 1273;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 224, this.context) ) {
                    case 1:
                        {
                        {
                        this.state = 1258;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1257;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1260;
                        this.match(CypherParser.T__10);
                        this.state = 1262;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1261;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1264;
                        this.oC_MultiplyDivideModuloExpression();
                        }
                        }
                        break;
                    case 2:
                        {
                        {
                        this.state = 1266;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1265;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1268;
                        this.match(CypherParser.T__21);
                        this.state = 1270;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1269;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1272;
                        this.oC_MultiplyDivideModuloExpression();
                        }
                        }
                        break;
                    }
                    }
                }
                this.state = 1277;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 225, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_MultiplyDivideModuloExpression(): OC_MultiplyDivideModuloExpressionContext {
        let localContext = new OC_MultiplyDivideModuloExpressionContext(this.context, this.state);
        this.enterRule(localContext, 136, CypherParser.RULE_oC_MultiplyDivideModuloExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1278;
            this.oC_PowerOfExpression();
            this.state = 1305;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 233, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    this.state = 1303;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 232, this.context) ) {
                    case 1:
                        {
                        {
                        this.state = 1280;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1279;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1282;
                        this.match(CypherParser.T__4);
                        this.state = 1284;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1283;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1286;
                        this.oC_PowerOfExpression();
                        }
                        }
                        break;
                    case 2:
                        {
                        {
                        this.state = 1288;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1287;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1290;
                        this.match(CypherParser.T__22);
                        this.state = 1292;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1291;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1294;
                        this.oC_PowerOfExpression();
                        }
                        }
                        break;
                    case 3:
                        {
                        {
                        this.state = 1296;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1295;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1298;
                        this.match(CypherParser.T__23);
                        this.state = 1300;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1299;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1302;
                        this.oC_PowerOfExpression();
                        }
                        }
                        break;
                    }
                    }
                }
                this.state = 1307;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 233, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_PowerOfExpression(): OC_PowerOfExpressionContext {
        let localContext = new OC_PowerOfExpressionContext(this.context, this.state);
        this.enterRule(localContext, 138, CypherParser.RULE_oC_PowerOfExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1308;
            this.oC_UnaryAddOrSubtractExpression();
            this.state = 1319;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 236, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1310;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1309;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1312;
                    this.match(CypherParser.T__24);
                    this.state = 1314;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1313;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1316;
                    this.oC_UnaryAddOrSubtractExpression();
                    }
                    }
                }
                this.state = 1321;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 236, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_UnaryAddOrSubtractExpression(): OC_UnaryAddOrSubtractExpressionContext {
        let localContext = new OC_UnaryAddOrSubtractExpressionContext(this.context, this.state);
        this.enterRule(localContext, 140, CypherParser.RULE_oC_UnaryAddOrSubtractExpression);
        let _la: number;
        try {
            this.state = 1328;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__1:
            case CypherParser.T__6:
            case CypherParser.T__11:
            case CypherParser.T__26:
            case CypherParser.UNION:
            case CypherParser.ALL:
            case CypherParser.FOREACH:
            case CypherParser.TRANSACTIONS:
            case CypherParser.ROWS:
            case CypherParser.ROW:
            case CypherParser.OPTIONAL:
            case CypherParser.MATCH:
            case CypherParser.UNWIND:
            case CypherParser.AS:
            case CypherParser.MERGE:
            case CypherParser.ON:
            case CypherParser.CREATE:
            case CypherParser.SET:
            case CypherParser.DETACH:
            case CypherParser.DELETE:
            case CypherParser.REMOVE:
            case CypherParser.CALL:
            case CypherParser.YIELD:
            case CypherParser.WITH:
            case CypherParser.RETURN:
            case CypherParser.DISTINCT:
            case CypherParser.ORDER:
            case CypherParser.BY:
            case CypherParser.L_SKIP:
            case CypherParser.LIMIT:
            case CypherParser.ASCENDING:
            case CypherParser.ASC:
            case CypherParser.DESCENDING:
            case CypherParser.DESC:
            case CypherParser.WHERE:
            case CypherParser.SHORTESTPATH:
            case CypherParser.ALLSHORTESTPATHS:
            case CypherParser.OR:
            case CypherParser.XOR:
            case CypherParser.AND:
            case CypherParser.NOT:
            case CypherParser.STARTS:
            case CypherParser.ENDS:
            case CypherParser.CONTAINS:
            case CypherParser.IN:
            case CypherParser.IS:
            case CypherParser.NULL:
            case CypherParser.REDUCE:
            case CypherParser.COUNT:
            case CypherParser.CASE:
            case CypherParser.ELSE:
            case CypherParser.END:
            case CypherParser.WHEN:
            case CypherParser.THEN:
            case CypherParser.ANY:
            case CypherParser.NONE:
            case CypherParser.SINGLE:
            case CypherParser.EXISTS:
            case CypherParser.TRUE:
            case CypherParser.FALSE:
            case CypherParser.HexInteger:
            case CypherParser.DecimalInteger:
            case CypherParser.OctalInteger:
            case CypherParser.HexLetter:
            case CypherParser.ExponentDecimalReal:
            case CypherParser.RegularDecimalReal:
            case CypherParser.StringLiteral:
            case CypherParser.CONSTRAINT:
            case CypherParser.DO:
            case CypherParser.FOR:
            case CypherParser.REQUIRE:
            case CypherParser.UNIQUE:
            case CypherParser.MANDATORY:
            case CypherParser.SCALAR:
            case CypherParser.OF:
            case CypherParser.ADD:
            case CypherParser.DROP:
            case CypherParser.FILTER:
            case CypherParser.EXTRACT:
            case CypherParser.UnescapedSymbolicName:
            case CypherParser.EscapedSymbolicName:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1322;
                this.oC_NonArithmeticOperatorExpression();
                }
                break;
            case CypherParser.T__10:
            case CypherParser.T__21:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1323;
                _la = this.tokenStream.LA(1);
                if(!(_la === 11 || _la === 22)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 1325;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1324;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1327;
                this.oC_NonArithmeticOperatorExpression();
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_NonArithmeticOperatorExpression(): OC_NonArithmeticOperatorExpressionContext {
        let localContext = new OC_NonArithmeticOperatorExpressionContext(this.context, this.state);
        this.enterRule(localContext, 142, CypherParser.RULE_oC_NonArithmeticOperatorExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1330;
            this.oC_Atom();
            this.state = 1341;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 242, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    this.state = 1339;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 241, this.context) ) {
                    case 1:
                        {
                        {
                        this.state = 1332;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1331;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1334;
                        this.oC_ListOperatorExpression();
                        }
                        }
                        break;
                    case 2:
                        {
                        {
                        this.state = 1336;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1335;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1338;
                        this.oC_PropertyLookup();
                        }
                        }
                        break;
                    }
                    }
                }
                this.state = 1343;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 242, this.context);
            }
            this.state = 1348;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 244, this.context) ) {
            case 1:
                {
                this.state = 1345;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1344;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1347;
                this.oC_NodeLabels();
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ListOperatorExpression(): OC_ListOperatorExpressionContext {
        let localContext = new OC_ListOperatorExpressionContext(this.context, this.state);
        this.enterRule(localContext, 144, CypherParser.RULE_oC_ListOperatorExpression);
        let _la: number;
        try {
            this.state = 1363;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 247, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1350;
                this.match(CypherParser.T__11);
                this.state = 1351;
                this.oC_Expression();
                this.state = 1352;
                this.match(CypherParser.T__12);
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1354;
                this.match(CypherParser.T__11);
                this.state = 1356;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294967295) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 268435455) !== 0) || ((((_la - 113)) & ~0x1F) === 0 && ((1 << (_la - 113)) & 655351) !== 0)) {
                    {
                    this.state = 1355;
                    this.oC_Expression();
                    }
                }

                this.state = 1358;
                this.match(CypherParser.T__14);
                this.state = 1360;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294967295) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 268435455) !== 0) || ((((_la - 113)) & ~0x1F) === 0 && ((1 << (_la - 113)) & 655351) !== 0)) {
                    {
                    this.state = 1359;
                    this.oC_Expression();
                    }
                }

                this.state = 1362;
                this.match(CypherParser.T__12);
                }
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_PropertyLookup(): OC_PropertyLookupContext {
        let localContext = new OC_PropertyLookupContext(this.context, this.state);
        this.enterRule(localContext, 146, CypherParser.RULE_oC_PropertyLookup);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1365;
            this.match(CypherParser.T__25);
            this.state = 1367;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1366;
                this.match(CypherParser.SP);
                }
            }

            {
            this.state = 1369;
            this.oC_PropertyKeyName();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Atom(): OC_AtomContext {
        let localContext = new OC_AtomContext(this.context, this.state);
        this.enterRule(localContext, 148, CypherParser.RULE_oC_Atom);
        let _la: number;
        try {
            this.state = 1398;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 252, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1371;
                this.oC_Literal();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1372;
                this.oC_Parameter();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 1373;
                this.oC_CaseExpression();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1374;
                this.oC_CountSubquery();
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                {
                this.state = 1375;
                this.match(CypherParser.COUNT);
                this.state = 1377;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1376;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1379;
                this.match(CypherParser.T__1);
                this.state = 1381;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1380;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1383;
                this.match(CypherParser.T__4);
                this.state = 1385;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1384;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1387;
                this.match(CypherParser.T__3);
                }
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1388;
                this.oC_ListComprehension();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 1389;
                this.oC_PatternComprehension();
                }
                break;
            case 8:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 1390;
                this.oC_Quantifier();
                }
                break;
            case 9:
                this.enterOuterAlt(localContext, 9);
                {
                this.state = 1391;
                this.oC_Reduce();
                }
                break;
            case 10:
                this.enterOuterAlt(localContext, 10);
                {
                this.state = 1392;
                this.oC_PatternPredicate();
                }
                break;
            case 11:
                this.enterOuterAlt(localContext, 11);
                {
                this.state = 1393;
                this.oC_ParenthesizedExpression();
                }
                break;
            case 12:
                this.enterOuterAlt(localContext, 12);
                {
                this.state = 1394;
                this.oC_FunctionInvocation();
                }
                break;
            case 13:
                this.enterOuterAlt(localContext, 13);
                {
                this.state = 1395;
                this.oC_ExistentialSubquery();
                }
                break;
            case 14:
                this.enterOuterAlt(localContext, 14);
                {
                this.state = 1396;
                this.oC_MapProjection();
                }
                break;
            case 15:
                this.enterOuterAlt(localContext, 15);
                {
                this.state = 1397;
                this.oC_Variable();
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Reduce(): OC_ReduceContext {
        let localContext = new OC_ReduceContext(this.context, this.state);
        this.enterRule(localContext, 150, CypherParser.RULE_oC_Reduce);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1400;
            this.match(CypherParser.REDUCE);
            this.state = 1402;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1401;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1404;
            this.match(CypherParser.T__1);
            this.state = 1406;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1405;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1408;
            this.oC_Variable();
            this.state = 1410;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1409;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1412;
            this.match(CypherParser.T__8);
            this.state = 1414;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1413;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1416;
            this.oC_Expression();
            this.state = 1418;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1417;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1420;
            this.match(CypherParser.T__5);
            this.state = 1422;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1421;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1424;
            this.oC_IdInColl();
            this.state = 1426;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1425;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1428;
            this.match(CypherParser.T__2);
            this.state = 1430;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1429;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1432;
            this.oC_Expression();
            this.state = 1434;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1433;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1436;
            this.match(CypherParser.T__3);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_MapProjection(): OC_MapProjectionContext {
        let localContext = new OC_MapProjectionContext(this.context, this.state);
        this.enterRule(localContext, 152, CypherParser.RULE_oC_MapProjection);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1438;
            this.oC_Variable();
            this.state = 1440;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1439;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1442;
            this.match(CypherParser.T__6);
            this.state = 1444;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1443;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1463;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 26 || ((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294967295) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 150994943) !== 0) || ((((_la - 117)) & ~0x1F) === 0 && ((1 << (_la - 117)) & 40959) !== 0)) {
                {
                this.state = 1446;
                this.oC_MapProjectionElement();
                this.state = 1448;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1447;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1460;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1450;
                    this.match(CypherParser.T__5);
                    this.state = 1452;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1451;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1454;
                    this.oC_MapProjectionElement();
                    this.state = 1456;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1455;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1462;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1465;
            this.match(CypherParser.T__7);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_MapProjectionElement(): OC_MapProjectionElementContext {
        let localContext = new OC_MapProjectionElementContext(this.context, this.state);
        this.enterRule(localContext, 154, CypherParser.RULE_oC_MapProjectionElement);
        let _la: number;
        try {
            this.state = 1488;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 273, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1467;
                this.oC_PropertyKeyName();
                this.state = 1469;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1468;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1471;
                this.match(CypherParser.T__13);
                this.state = 1473;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1472;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1475;
                this.oC_Expression();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1477;
                this.match(CypherParser.T__25);
                this.state = 1479;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1478;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1481;
                this.oC_PropertyKeyName();
                }
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 1482;
                this.match(CypherParser.T__25);
                this.state = 1484;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1483;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1486;
                this.match(CypherParser.T__4);
                }
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1487;
                this.oC_Variable();
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_CaseExpression(): OC_CaseExpressionContext {
        let localContext = new OC_CaseExpressionContext(this.context, this.state);
        this.enterRule(localContext, 156, CypherParser.RULE_oC_CaseExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1512;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 279, this.context) ) {
            case 1:
                {
                {
                this.state = 1490;
                this.match(CypherParser.CASE);
                this.state = 1495;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 1492;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1491;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1494;
                        this.oC_CaseAlternative();
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 1497;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 275, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                }
                }
                break;
            case 2:
                {
                {
                this.state = 1499;
                this.match(CypherParser.CASE);
                this.state = 1501;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1500;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1503;
                this.oC_Expression();
                this.state = 1508;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 1505;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1504;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1507;
                        this.oC_CaseAlternative();
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 1510;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 278, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                }
                }
                break;
            }
            this.state = 1522;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 282, this.context) ) {
            case 1:
                {
                this.state = 1515;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1514;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1517;
                this.match(CypherParser.ELSE);
                this.state = 1519;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1518;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1521;
                this.oC_Expression();
                }
                break;
            }
            this.state = 1525;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1524;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1527;
            this.match(CypherParser.END);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_CaseAlternative(): OC_CaseAlternativeContext {
        let localContext = new OC_CaseAlternativeContext(this.context, this.state);
        this.enterRule(localContext, 158, CypherParser.RULE_oC_CaseAlternative);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1529;
            this.match(CypherParser.WHEN);
            this.state = 1531;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1530;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1533;
            this.oC_Expression();
            this.state = 1535;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1534;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1537;
            this.match(CypherParser.THEN);
            this.state = 1539;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1538;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1541;
            this.oC_Expression();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ListComprehension(): OC_ListComprehensionContext {
        let localContext = new OC_ListComprehensionContext(this.context, this.state);
        this.enterRule(localContext, 160, CypherParser.RULE_oC_ListComprehension);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1543;
            this.match(CypherParser.T__11);
            this.state = 1545;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1544;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1547;
            this.oC_FilterExpression();
            this.state = 1556;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 290, this.context) ) {
            case 1:
                {
                this.state = 1549;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1548;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1551;
                this.match(CypherParser.T__2);
                this.state = 1553;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1552;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1555;
                this.oC_Expression();
                }
                break;
            }
            this.state = 1559;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1558;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1561;
            this.match(CypherParser.T__12);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_PatternComprehension(): OC_PatternComprehensionContext {
        let localContext = new OC_PatternComprehensionContext(this.context, this.state);
        this.enterRule(localContext, 162, CypherParser.RULE_oC_PatternComprehension);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1563;
            this.match(CypherParser.T__11);
            this.state = 1565;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1564;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1575;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294967295) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 138411007) !== 0) || ((((_la - 117)) & ~0x1F) === 0 && ((1 << (_la - 117)) & 40959) !== 0)) {
                {
                this.state = 1567;
                this.oC_Variable();
                this.state = 1569;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1568;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1571;
                this.match(CypherParser.T__8);
                this.state = 1573;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1572;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1577;
            this.oC_RelationshipsPattern();
            this.state = 1579;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1578;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1585;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 77) {
                {
                this.state = 1581;
                this.oC_Where();
                this.state = 1583;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1582;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1587;
            this.match(CypherParser.T__2);
            this.state = 1589;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1588;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1591;
            this.oC_Expression();
            this.state = 1593;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1592;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1595;
            this.match(CypherParser.T__12);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Quantifier(): OC_QuantifierContext {
        let localContext = new OC_QuantifierContext(this.context, this.state);
        this.enterRule(localContext, 164, CypherParser.RULE_oC_Quantifier);
        let _la: number;
        try {
            this.state = 1653;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.ALL:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1597;
                this.match(CypherParser.ALL);
                this.state = 1599;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1598;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1601;
                this.match(CypherParser.T__1);
                this.state = 1603;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1602;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1605;
                this.oC_FilterExpression();
                this.state = 1607;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1606;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1609;
                this.match(CypherParser.T__3);
                }
                }
                break;
            case CypherParser.ANY:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1611;
                this.match(CypherParser.ANY);
                this.state = 1613;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1612;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1615;
                this.match(CypherParser.T__1);
                this.state = 1617;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1616;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1619;
                this.oC_FilterExpression();
                this.state = 1621;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1620;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1623;
                this.match(CypherParser.T__3);
                }
                }
                break;
            case CypherParser.NONE:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 1625;
                this.match(CypherParser.NONE);
                this.state = 1627;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1626;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1629;
                this.match(CypherParser.T__1);
                this.state = 1631;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1630;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1633;
                this.oC_FilterExpression();
                this.state = 1635;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1634;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1637;
                this.match(CypherParser.T__3);
                }
                }
                break;
            case CypherParser.SINGLE:
                this.enterOuterAlt(localContext, 4);
                {
                {
                this.state = 1639;
                this.match(CypherParser.SINGLE);
                this.state = 1641;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1640;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1643;
                this.match(CypherParser.T__1);
                this.state = 1645;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1644;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1647;
                this.oC_FilterExpression();
                this.state = 1649;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1648;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1651;
                this.match(CypherParser.T__3);
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_FilterExpression(): OC_FilterExpressionContext {
        let localContext = new OC_FilterExpressionContext(this.context, this.state);
        this.enterRule(localContext, 166, CypherParser.RULE_oC_FilterExpression);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1655;
            this.oC_IdInColl();
            this.state = 1660;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 315, this.context) ) {
            case 1:
                {
                this.state = 1657;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1656;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1659;
                this.oC_Where();
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_PatternPredicate(): OC_PatternPredicateContext {
        let localContext = new OC_PatternPredicateContext(this.context, this.state);
        this.enterRule(localContext, 168, CypherParser.RULE_oC_PatternPredicate);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1662;
            this.oC_RelationshipsPattern();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ParenthesizedExpression(): OC_ParenthesizedExpressionContext {
        let localContext = new OC_ParenthesizedExpressionContext(this.context, this.state);
        this.enterRule(localContext, 170, CypherParser.RULE_oC_ParenthesizedExpression);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1664;
            this.match(CypherParser.T__1);
            this.state = 1666;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1665;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1668;
            this.oC_Expression();
            this.state = 1670;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1669;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1672;
            this.match(CypherParser.T__3);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_IdInColl(): OC_IdInCollContext {
        let localContext = new OC_IdInCollContext(this.context, this.state);
        this.enterRule(localContext, 172, CypherParser.RULE_oC_IdInColl);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1674;
            this.oC_Variable();
            this.state = 1675;
            this.match(CypherParser.SP);
            this.state = 1676;
            this.match(CypherParser.IN);
            this.state = 1677;
            this.match(CypherParser.SP);
            this.state = 1678;
            this.oC_Expression();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_FunctionInvocation(): OC_FunctionInvocationContext {
        let localContext = new OC_FunctionInvocationContext(this.context, this.state);
        this.enterRule(localContext, 174, CypherParser.RULE_oC_FunctionInvocation);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1680;
            this.oC_FunctionName();
            this.state = 1682;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1681;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1684;
            this.match(CypherParser.T__1);
            this.state = 1686;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1685;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1692;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 321, this.context) ) {
            case 1:
                {
                this.state = 1688;
                this.match(CypherParser.DISTINCT);
                this.state = 1690;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1689;
                    this.match(CypherParser.SP);
                    }
                }

                }
                break;
            }
            this.state = 1711;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294967295) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 268435455) !== 0) || ((((_la - 113)) & ~0x1F) === 0 && ((1 << (_la - 113)) & 655351) !== 0)) {
                {
                this.state = 1694;
                this.oC_Expression();
                this.state = 1696;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1695;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1708;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1698;
                    this.match(CypherParser.T__5);
                    this.state = 1700;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1699;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1702;
                    this.oC_Expression();
                    this.state = 1704;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1703;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1710;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1713;
            this.match(CypherParser.T__3);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_FunctionName(): OC_FunctionNameContext {
        let localContext = new OC_FunctionNameContext(this.context, this.state);
        this.enterRule(localContext, 176, CypherParser.RULE_oC_FunctionName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1715;
            this.oC_Namespace();
            this.state = 1716;
            this.oC_SymbolicName();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ExistentialSubquery(): OC_ExistentialSubqueryContext {
        let localContext = new OC_ExistentialSubqueryContext(this.context, this.state);
        this.enterRule(localContext, 178, CypherParser.RULE_oC_ExistentialSubquery);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1718;
            this.match(CypherParser.EXISTS);
            this.state = 1720;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1719;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1722;
            this.match(CypherParser.T__6);
            this.state = 1724;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1723;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1735;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 331, this.context) ) {
            case 1:
                {
                this.state = 1726;
                this.oC_RegularQuery();
                }
                break;
            case 2:
                {
                this.state = 1727;
                this.oC_SubqueryReadings();
                }
                break;
            case 3:
                {
                {
                this.state = 1728;
                this.oC_Pattern();
                this.state = 1733;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 330, this.context) ) {
                case 1:
                    {
                    this.state = 1730;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1729;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1732;
                    this.oC_Where();
                    }
                    break;
                }
                }
                }
                break;
            }
            this.state = 1738;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1737;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1740;
            this.match(CypherParser.T__7);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_CountSubquery(): OC_CountSubqueryContext {
        let localContext = new OC_CountSubqueryContext(this.context, this.state);
        this.enterRule(localContext, 180, CypherParser.RULE_oC_CountSubquery);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1742;
            this.match(CypherParser.COUNT);
            this.state = 1744;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1743;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1746;
            this.match(CypherParser.T__6);
            this.state = 1748;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1747;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1759;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 337, this.context) ) {
            case 1:
                {
                this.state = 1750;
                this.oC_RegularQuery();
                }
                break;
            case 2:
                {
                this.state = 1751;
                this.oC_SubqueryReadings();
                }
                break;
            case 3:
                {
                {
                this.state = 1752;
                this.oC_Pattern();
                this.state = 1757;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 336, this.context) ) {
                case 1:
                    {
                    this.state = 1754;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1753;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1756;
                    this.oC_Where();
                    }
                    break;
                }
                }
                }
                break;
            }
            this.state = 1762;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1761;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1764;
            this.match(CypherParser.T__7);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_SubqueryReadings(): OC_SubqueryReadingsContext {
        let localContext = new OC_SubqueryReadingsContext(this.context, this.state);
        this.enterRule(localContext, 182, CypherParser.RULE_oC_SubqueryReadings);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1766;
            this.oC_ReadingClause();
            this.state = 1773;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 340, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1768;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1767;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1770;
                    this.oC_ReadingClause();
                    }
                    }
                }
                this.state = 1775;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 340, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ExplicitProcedureInvocation(): OC_ExplicitProcedureInvocationContext {
        let localContext = new OC_ExplicitProcedureInvocationContext(this.context, this.state);
        this.enterRule(localContext, 184, CypherParser.RULE_oC_ExplicitProcedureInvocation);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1776;
            this.oC_ProcedureName();
            this.state = 1778;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1777;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1780;
            this.match(CypherParser.T__1);
            this.state = 1782;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1781;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1801;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294967295) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 268435455) !== 0) || ((((_la - 113)) & ~0x1F) === 0 && ((1 << (_la - 113)) & 655351) !== 0)) {
                {
                this.state = 1784;
                this.oC_Expression();
                this.state = 1786;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1785;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1798;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1788;
                    this.match(CypherParser.T__5);
                    this.state = 1790;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1789;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1792;
                    this.oC_Expression();
                    this.state = 1794;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1793;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1800;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1803;
            this.match(CypherParser.T__3);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ImplicitProcedureInvocation(): OC_ImplicitProcedureInvocationContext {
        let localContext = new OC_ImplicitProcedureInvocationContext(this.context, this.state);
        this.enterRule(localContext, 186, CypherParser.RULE_oC_ImplicitProcedureInvocation);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1805;
            this.oC_ProcedureName();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ProcedureResultField(): OC_ProcedureResultFieldContext {
        let localContext = new OC_ProcedureResultFieldContext(this.context, this.state);
        this.enterRule(localContext, 188, CypherParser.RULE_oC_ProcedureResultField);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1807;
            this.oC_SymbolicName();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ProcedureName(): OC_ProcedureNameContext {
        let localContext = new OC_ProcedureNameContext(this.context, this.state);
        this.enterRule(localContext, 190, CypherParser.RULE_oC_ProcedureName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1809;
            this.oC_Namespace();
            this.state = 1810;
            this.oC_SymbolicName();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Namespace(): OC_NamespaceContext {
        let localContext = new OC_NamespaceContext(this.context, this.state);
        this.enterRule(localContext, 192, CypherParser.RULE_oC_Namespace);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1817;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 348, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1812;
                    this.oC_SymbolicName();
                    this.state = 1813;
                    this.match(CypherParser.T__25);
                    }
                    }
                }
                this.state = 1819;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 348, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Variable(): OC_VariableContext {
        let localContext = new OC_VariableContext(this.context, this.state);
        this.enterRule(localContext, 194, CypherParser.RULE_oC_Variable);
        try {
            this.state = 1822;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.FOREACH:
            case CypherParser.TRANSACTIONS:
            case CypherParser.ROWS:
            case CypherParser.ROW:
            case CypherParser.SHORTESTPATH:
            case CypherParser.ALLSHORTESTPATHS:
            case CypherParser.REDUCE:
            case CypherParser.COUNT:
            case CypherParser.ANY:
            case CypherParser.NONE:
            case CypherParser.SINGLE:
            case CypherParser.HexLetter:
            case CypherParser.OF:
            case CypherParser.FILTER:
            case CypherParser.EXTRACT:
            case CypherParser.UnescapedSymbolicName:
            case CypherParser.EscapedSymbolicName:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1820;
                this.oC_SymbolicName();
                }
                break;
            case CypherParser.UNION:
            case CypherParser.ALL:
            case CypherParser.OPTIONAL:
            case CypherParser.MATCH:
            case CypherParser.UNWIND:
            case CypherParser.AS:
            case CypherParser.MERGE:
            case CypherParser.ON:
            case CypherParser.CREATE:
            case CypherParser.SET:
            case CypherParser.DETACH:
            case CypherParser.DELETE:
            case CypherParser.REMOVE:
            case CypherParser.CALL:
            case CypherParser.YIELD:
            case CypherParser.WITH:
            case CypherParser.RETURN:
            case CypherParser.DISTINCT:
            case CypherParser.ORDER:
            case CypherParser.BY:
            case CypherParser.L_SKIP:
            case CypherParser.LIMIT:
            case CypherParser.ASCENDING:
            case CypherParser.ASC:
            case CypherParser.DESCENDING:
            case CypherParser.DESC:
            case CypherParser.WHERE:
            case CypherParser.OR:
            case CypherParser.XOR:
            case CypherParser.AND:
            case CypherParser.NOT:
            case CypherParser.STARTS:
            case CypherParser.ENDS:
            case CypherParser.CONTAINS:
            case CypherParser.IN:
            case CypherParser.IS:
            case CypherParser.CASE:
            case CypherParser.ELSE:
            case CypherParser.END:
            case CypherParser.WHEN:
            case CypherParser.THEN:
            case CypherParser.EXISTS:
            case CypherParser.CONSTRAINT:
            case CypherParser.DO:
            case CypherParser.FOR:
            case CypherParser.REQUIRE:
            case CypherParser.UNIQUE:
            case CypherParser.MANDATORY:
            case CypherParser.SCALAR:
            case CypherParser.ADD:
            case CypherParser.DROP:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1821;
                this.oC_KeywordVariable();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_KeywordVariable(): OC_KeywordVariableContext {
        let localContext = new OC_KeywordVariableContext(this.context, this.state);
        this.enterRule(localContext, 196, CypherParser.RULE_oC_KeywordVariable);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1824;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 2147483587) !== 0) || ((((_la - 80)) & ~0x1F) === 0 && ((1 << (_la - 80)) & 1176063) !== 0) || ((((_la - 117)) & ~0x1F) === 0 && ((1 << (_la - 117)) & 895) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Literal(): OC_LiteralContext {
        let localContext = new OC_LiteralContext(this.context, this.state);
        this.enterRule(localContext, 198, CypherParser.RULE_oC_Literal);
        try {
            this.state = 1832;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.TRUE:
            case CypherParser.FALSE:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1826;
                this.oC_BooleanLiteral();
                }
                break;
            case CypherParser.NULL:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1827;
                this.match(CypherParser.NULL);
                }
                break;
            case CypherParser.HexInteger:
            case CypherParser.DecimalInteger:
            case CypherParser.OctalInteger:
            case CypherParser.ExponentDecimalReal:
            case CypherParser.RegularDecimalReal:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 1828;
                this.oC_NumberLiteral();
                }
                break;
            case CypherParser.StringLiteral:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1829;
                this.match(CypherParser.StringLiteral);
                }
                break;
            case CypherParser.T__11:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 1830;
                this.oC_ListLiteral();
                }
                break;
            case CypherParser.T__6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1831;
                this.oC_MapLiteral();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_BooleanLiteral(): OC_BooleanLiteralContext {
        let localContext = new OC_BooleanLiteralContext(this.context, this.state);
        this.enterRule(localContext, 200, CypherParser.RULE_oC_BooleanLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1834;
            _la = this.tokenStream.LA(1);
            if(!(_la === 101 || _la === 102)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_NumberLiteral(): OC_NumberLiteralContext {
        let localContext = new OC_NumberLiteralContext(this.context, this.state);
        this.enterRule(localContext, 202, CypherParser.RULE_oC_NumberLiteral);
        try {
            this.state = 1838;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.ExponentDecimalReal:
            case CypherParser.RegularDecimalReal:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1836;
                this.oC_DoubleLiteral();
                }
                break;
            case CypherParser.HexInteger:
            case CypherParser.DecimalInteger:
            case CypherParser.OctalInteger:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1837;
                this.oC_IntegerLiteral();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_IntegerLiteral(): OC_IntegerLiteralContext {
        let localContext = new OC_IntegerLiteralContext(this.context, this.state);
        this.enterRule(localContext, 204, CypherParser.RULE_oC_IntegerLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1840;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_DoubleLiteral(): OC_DoubleLiteralContext {
        let localContext = new OC_DoubleLiteralContext(this.context, this.state);
        this.enterRule(localContext, 206, CypherParser.RULE_oC_DoubleLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1842;
            _la = this.tokenStream.LA(1);
            if(!(_la === 113 || _la === 114)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ListLiteral(): OC_ListLiteralContext {
        let localContext = new OC_ListLiteralContext(this.context, this.state);
        this.enterRule(localContext, 208, CypherParser.RULE_oC_ListLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1844;
            this.match(CypherParser.T__11);
            this.state = 1846;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1845;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1865;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294967295) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 268435455) !== 0) || ((((_la - 113)) & ~0x1F) === 0 && ((1 << (_la - 113)) & 655351) !== 0)) {
                {
                this.state = 1848;
                this.oC_Expression();
                this.state = 1850;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1849;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1862;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1852;
                    this.match(CypherParser.T__5);
                    this.state = 1854;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1853;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1856;
                    this.oC_Expression();
                    this.state = 1858;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1857;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1864;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1867;
            this.match(CypherParser.T__12);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_MapLiteral(): OC_MapLiteralContext {
        let localContext = new OC_MapLiteralContext(this.context, this.state);
        this.enterRule(localContext, 210, CypherParser.RULE_oC_MapLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1869;
            this.match(CypherParser.T__6);
            this.state = 1871;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1870;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1906;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294574079) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 150994943) !== 0) || ((((_la - 117)) & ~0x1F) === 0 && ((1 << (_la - 117)) & 40959) !== 0)) {
                {
                this.state = 1873;
                this.oC_PropertyKeyName();
                this.state = 1875;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1874;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1877;
                this.match(CypherParser.T__13);
                this.state = 1879;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1878;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1881;
                this.oC_Expression();
                this.state = 1883;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1882;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1903;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1885;
                    this.match(CypherParser.T__5);
                    this.state = 1887;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1886;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1889;
                    this.oC_PropertyKeyName();
                    this.state = 1891;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1890;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1893;
                    this.match(CypherParser.T__13);
                    this.state = 1895;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1894;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1897;
                    this.oC_Expression();
                    this.state = 1899;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1898;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1905;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1908;
            this.match(CypherParser.T__7);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_PropertyKeyName(): OC_PropertyKeyNameContext {
        let localContext = new OC_PropertyKeyNameContext(this.context, this.state);
        this.enterRule(localContext, 212, CypherParser.RULE_oC_PropertyKeyName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1910;
            this.oC_SchemaName();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Parameter(): OC_ParameterContext {
        let localContext = new OC_ParameterContext(this.context, this.state);
        this.enterRule(localContext, 214, CypherParser.RULE_oC_Parameter);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1912;
            this.match(CypherParser.T__26);
            this.state = 1917;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.UNION:
            case CypherParser.ALL:
            case CypherParser.FOREACH:
            case CypherParser.TRANSACTIONS:
            case CypherParser.ROWS:
            case CypherParser.ROW:
            case CypherParser.OPTIONAL:
            case CypherParser.MATCH:
            case CypherParser.UNWIND:
            case CypherParser.AS:
            case CypherParser.MERGE:
            case CypherParser.ON:
            case CypherParser.CREATE:
            case CypherParser.SET:
            case CypherParser.DETACH:
            case CypherParser.DELETE:
            case CypherParser.REMOVE:
            case CypherParser.WITH:
            case CypherParser.RETURN:
            case CypherParser.DISTINCT:
            case CypherParser.ORDER:
            case CypherParser.BY:
            case CypherParser.L_SKIP:
            case CypherParser.LIMIT:
            case CypherParser.ASCENDING:
            case CypherParser.ASC:
            case CypherParser.DESCENDING:
            case CypherParser.DESC:
            case CypherParser.WHERE:
            case CypherParser.SHORTESTPATH:
            case CypherParser.ALLSHORTESTPATHS:
            case CypherParser.OR:
            case CypherParser.XOR:
            case CypherParser.AND:
            case CypherParser.NOT:
            case CypherParser.STARTS:
            case CypherParser.ENDS:
            case CypherParser.CONTAINS:
            case CypherParser.IN:
            case CypherParser.IS:
            case CypherParser.NULL:
            case CypherParser.REDUCE:
            case CypherParser.COUNT:
            case CypherParser.CASE:
            case CypherParser.ELSE:
            case CypherParser.END:
            case CypherParser.WHEN:
            case CypherParser.THEN:
            case CypherParser.ANY:
            case CypherParser.NONE:
            case CypherParser.SINGLE:
            case CypherParser.EXISTS:
            case CypherParser.TRUE:
            case CypherParser.FALSE:
            case CypherParser.HexLetter:
            case CypherParser.CONSTRAINT:
            case CypherParser.DO:
            case CypherParser.FOR:
            case CypherParser.REQUIRE:
            case CypherParser.UNIQUE:
            case CypherParser.MANDATORY:
            case CypherParser.SCALAR:
            case CypherParser.OF:
            case CypherParser.ADD:
            case CypherParser.DROP:
            case CypherParser.FILTER:
            case CypherParser.EXTRACT:
            case CypherParser.UnescapedSymbolicName:
            case CypherParser.EscapedSymbolicName:
                {
                this.state = 1913;
                this.oC_SchemaName();
                }
                break;
            case CypherParser.CALL:
                {
                this.state = 1914;
                this.match(CypherParser.CALL);
                }
                break;
            case CypherParser.YIELD:
                {
                this.state = 1915;
                this.match(CypherParser.YIELD);
                }
                break;
            case CypherParser.DecimalInteger:
                {
                this.state = 1916;
                this.match(CypherParser.DecimalInteger);
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_SchemaName(): OC_SchemaNameContext {
        let localContext = new OC_SchemaNameContext(this.context, this.state);
        this.enterRule(localContext, 216, CypherParser.RULE_oC_SchemaName);
        try {
            this.state = 1921;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 369, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1919;
                this.oC_SymbolicName();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1920;
                this.oC_ReservedWord();
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_ReservedWord(): OC_ReservedWordContext {
        let localContext = new OC_ReservedWordContext(this.context, this.state);
        this.enterRule(localContext, 218, CypherParser.RULE_oC_ReservedWord);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1923;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 2147090371) !== 0) || ((((_la - 80)) & ~0x1F) === 0 && ((1 << (_la - 80)) & 7468031) !== 0) || ((((_la - 117)) & ~0x1F) === 0 && ((1 << (_la - 117)) & 1023) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_SymbolicName(): OC_SymbolicNameContext {
        let localContext = new OC_SymbolicNameContext(this.context, this.state);
        this.enterRule(localContext, 220, CypherParser.RULE_oC_SymbolicName);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1925;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 49)) & ~0x1F) === 0 && ((1 << (_la - 49)) & 1610612751) !== 0) || ((((_la - 90)) & ~0x1F) === 0 && ((1 << (_la - 90)) & 66435) !== 0) || ((((_la - 124)) & ~0x1F) === 0 && ((1 << (_la - 124)) & 313) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_LeftArrowHead(): OC_LeftArrowHeadContext {
        let localContext = new OC_LeftArrowHeadContext(this.context, this.state);
        this.enterRule(localContext, 222, CypherParser.RULE_oC_LeftArrowHead);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1927;
            _la = this.tokenStream.LA(1);
            if(!((((_la) & ~0x1F) === 0 && ((1 << _la) & 4026662912) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_RightArrowHead(): OC_RightArrowHeadContext {
        let localContext = new OC_RightArrowHeadContext(this.context, this.state);
        this.enterRule(localContext, 224, CypherParser.RULE_oC_RightArrowHead);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1929;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 18)) & ~0x1F) === 0 && ((1 << (_la - 18)) & 245761) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public oC_Dash(): OC_DashContext {
        let localContext = new OC_DashContext(this.context, this.state);
        this.enterRule(localContext, 226, CypherParser.RULE_oC_Dash);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1931;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 22)) & ~0x1F) === 0 && ((1 << (_la - 22)) & 33538049) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public static readonly _serializedATN: number[] = [
        4,1,135,1934,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,
        7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,13,7,
        13,2,14,7,14,2,15,7,15,2,16,7,16,2,17,7,17,2,18,7,18,2,19,7,19,2,
        20,7,20,2,21,7,21,2,22,7,22,2,23,7,23,2,24,7,24,2,25,7,25,2,26,7,
        26,2,27,7,27,2,28,7,28,2,29,7,29,2,30,7,30,2,31,7,31,2,32,7,32,2,
        33,7,33,2,34,7,34,2,35,7,35,2,36,7,36,2,37,7,37,2,38,7,38,2,39,7,
        39,2,40,7,40,2,41,7,41,2,42,7,42,2,43,7,43,2,44,7,44,2,45,7,45,2,
        46,7,46,2,47,7,47,2,48,7,48,2,49,7,49,2,50,7,50,2,51,7,51,2,52,7,
        52,2,53,7,53,2,54,7,54,2,55,7,55,2,56,7,56,2,57,7,57,2,58,7,58,2,
        59,7,59,2,60,7,60,2,61,7,61,2,62,7,62,2,63,7,63,2,64,7,64,2,65,7,
        65,2,66,7,66,2,67,7,67,2,68,7,68,2,69,7,69,2,70,7,70,2,71,7,71,2,
        72,7,72,2,73,7,73,2,74,7,74,2,75,7,75,2,76,7,76,2,77,7,77,2,78,7,
        78,2,79,7,79,2,80,7,80,2,81,7,81,2,82,7,82,2,83,7,83,2,84,7,84,2,
        85,7,85,2,86,7,86,2,87,7,87,2,88,7,88,2,89,7,89,2,90,7,90,2,91,7,
        91,2,92,7,92,2,93,7,93,2,94,7,94,2,95,7,95,2,96,7,96,2,97,7,97,2,
        98,7,98,2,99,7,99,2,100,7,100,2,101,7,101,2,102,7,102,2,103,7,103,
        2,104,7,104,2,105,7,105,2,106,7,106,2,107,7,107,2,108,7,108,2,109,
        7,109,2,110,7,110,2,111,7,111,2,112,7,112,2,113,7,113,1,0,3,0,230,
        8,0,1,0,1,0,3,0,234,8,0,1,0,3,0,237,8,0,1,0,3,0,240,8,0,1,0,1,0,
        1,1,1,1,1,2,1,2,3,2,248,8,2,1,3,1,3,3,3,252,8,3,1,3,5,3,255,8,3,
        10,3,12,3,258,9,3,1,4,1,4,1,4,1,4,3,4,264,8,4,1,4,1,4,1,4,3,4,269,
        8,4,1,4,3,4,272,8,4,1,5,1,5,3,5,276,8,5,1,6,1,6,3,6,280,8,6,5,6,
        282,8,6,10,6,12,6,285,9,6,1,6,1,6,1,6,3,6,290,8,6,5,6,292,8,6,10,
        6,12,6,295,9,6,1,6,1,6,3,6,299,8,6,1,6,5,6,302,8,6,10,6,12,6,305,
        9,6,1,6,3,6,308,8,6,1,6,5,6,311,8,6,10,6,12,6,314,9,6,1,6,3,6,317,
        8,6,1,6,5,6,320,8,6,10,6,12,6,323,9,6,1,6,3,6,326,8,6,1,6,3,6,329,
        8,6,3,6,331,8,6,1,7,1,7,3,7,335,8,7,1,7,3,7,338,8,7,5,7,340,8,7,
        10,7,12,7,343,9,7,1,7,1,7,3,7,347,8,7,4,7,349,8,7,11,7,12,7,350,
        1,7,1,7,1,8,1,8,1,8,1,8,1,8,1,8,1,8,3,8,362,8,8,1,9,1,9,3,9,366,
        8,9,1,9,1,9,3,9,370,8,9,1,9,1,9,1,9,1,9,1,9,1,9,3,9,378,8,9,1,9,
        1,9,3,9,382,8,9,1,9,4,9,385,8,9,11,9,12,9,386,1,9,3,9,390,8,9,1,
        9,1,9,1,10,1,10,1,10,1,10,3,10,398,8,10,1,11,1,11,3,11,402,8,11,
        1,11,1,11,3,11,406,8,11,1,11,1,11,3,11,410,8,11,1,11,1,11,1,11,3,
        11,415,8,11,1,11,1,11,3,11,419,8,11,1,11,5,11,422,8,11,10,11,12,
        11,425,9,11,3,11,427,8,11,1,11,3,11,430,8,11,1,11,1,11,3,11,434,
        8,11,3,11,436,8,11,1,11,1,11,3,11,440,8,11,1,11,1,11,3,11,444,8,
        11,1,11,1,11,1,11,1,11,1,11,1,11,1,11,1,11,1,11,1,11,1,11,1,11,3,
        11,458,8,11,3,11,460,8,11,1,12,1,12,3,12,464,8,12,1,12,1,12,3,12,
        468,8,12,1,12,1,12,3,12,472,8,12,1,12,3,12,475,8,12,1,13,1,13,3,
        13,479,8,13,1,13,1,13,1,13,1,13,1,13,1,13,1,14,1,14,3,14,489,8,14,
        1,14,1,14,1,14,5,14,494,8,14,10,14,12,14,497,9,14,1,15,1,15,1,15,
        1,15,1,15,1,15,1,15,1,15,1,15,1,15,3,15,509,8,15,1,16,1,16,3,16,
        513,8,16,1,16,1,16,1,17,1,17,3,17,519,8,17,1,17,1,17,3,17,523,8,
        17,1,17,1,17,3,17,527,8,17,1,17,5,17,530,8,17,10,17,12,17,533,9,
        17,1,18,1,18,3,18,537,8,18,1,18,1,18,3,18,541,8,18,1,18,1,18,1,18,
        1,18,3,18,547,8,18,1,18,1,18,3,18,551,8,18,1,18,1,18,1,18,1,18,3,
        18,557,8,18,1,18,1,18,3,18,561,8,18,1,18,1,18,1,18,1,18,3,18,567,
        8,18,1,18,1,18,3,18,571,8,18,1,19,1,19,3,19,575,8,19,1,19,1,19,3,
        19,579,8,19,1,19,1,19,3,19,583,8,19,1,19,1,19,3,19,587,8,19,1,19,
        5,19,590,8,19,10,19,12,19,593,9,19,1,20,1,20,1,20,1,20,3,20,599,
        8,20,1,20,1,20,3,20,603,8,20,1,20,5,20,606,8,20,10,20,12,20,609,
        9,20,1,21,1,21,1,21,1,21,3,21,615,8,21,1,22,1,22,1,22,1,22,3,22,
        621,8,22,1,22,1,22,1,22,3,22,626,8,22,1,23,1,23,1,23,1,23,3,23,632,
        8,23,1,23,3,23,635,8,23,1,23,1,23,1,23,1,23,3,23,641,8,23,3,23,643,
        8,23,1,24,1,24,3,24,647,8,24,1,24,1,24,3,24,651,8,24,1,24,5,24,654,
        8,24,10,24,12,24,657,9,24,1,24,3,24,660,8,24,1,24,3,24,663,8,24,
        1,25,1,25,1,25,1,25,1,25,3,25,670,8,25,1,25,1,25,1,26,1,26,1,26,
        3,26,677,8,26,1,26,3,26,680,8,26,1,27,1,27,1,27,1,28,3,28,686,8,
        28,1,28,3,28,689,8,28,1,28,1,28,1,28,1,28,3,28,695,8,28,1,28,1,28,
        3,28,699,8,28,1,28,1,28,3,28,703,8,28,1,29,1,29,3,29,707,8,29,1,
        29,1,29,3,29,711,8,29,1,29,5,29,714,8,29,10,29,12,29,717,9,29,1,
        29,1,29,3,29,721,8,29,1,29,1,29,3,29,725,8,29,1,29,5,29,728,8,29,
        10,29,12,29,731,9,29,3,29,733,8,29,1,30,1,30,1,30,1,30,1,30,1,30,
        1,30,3,30,742,8,30,1,31,1,31,1,31,1,31,1,31,1,31,1,31,3,31,751,8,
        31,1,31,5,31,754,8,31,10,31,12,31,757,9,31,1,32,1,32,1,32,1,32,1,
        33,1,33,1,33,1,33,1,34,1,34,3,34,769,8,34,1,34,3,34,772,8,34,1,35,
        1,35,1,35,1,35,1,36,1,36,3,36,780,8,36,1,36,1,36,3,36,784,8,36,1,
        36,5,36,787,8,36,10,36,12,36,790,9,36,1,37,1,37,3,37,794,8,37,1,
        37,1,37,3,37,798,8,37,1,37,1,37,1,37,3,37,803,8,37,1,38,1,38,3,38,
        807,8,38,1,39,1,39,3,39,811,8,39,1,39,1,39,3,39,815,8,39,1,39,1,
        39,3,39,819,8,39,1,39,1,39,1,39,1,39,3,39,825,8,39,1,39,1,39,3,39,
        829,8,39,1,39,1,39,3,39,833,8,39,1,39,1,39,3,39,837,8,39,1,40,1,
        40,3,40,841,8,40,1,40,3,40,844,8,40,1,40,1,40,1,40,3,40,849,8,40,
        5,40,851,8,40,10,40,12,40,854,9,40,1,40,1,40,1,40,1,40,3,40,860,
        8,40,1,41,1,41,3,41,864,8,41,1,41,1,41,3,41,868,8,41,1,41,3,41,871,
        8,41,1,41,3,41,874,8,41,1,41,1,41,3,41,878,8,41,1,41,1,41,1,42,1,
        42,3,42,884,8,42,1,42,4,42,887,8,42,11,42,12,42,888,1,43,1,43,3,
        43,893,8,43,1,43,1,43,3,43,897,8,43,3,43,899,8,43,1,43,1,43,3,43,
        903,8,43,3,43,905,8,43,1,43,1,43,3,43,909,8,43,3,43,911,8,43,1,43,
        1,43,1,44,1,44,3,44,917,8,44,1,44,3,44,920,8,44,1,44,3,44,923,8,
        44,1,44,1,44,1,45,1,45,1,45,1,45,3,45,931,8,45,1,45,3,45,934,8,45,
        1,45,3,45,937,8,45,1,45,1,45,3,45,941,8,45,1,45,3,45,944,8,45,1,
        45,3,45,947,8,45,3,45,949,8,45,1,45,3,45,952,8,45,1,46,1,46,3,46,
        956,8,46,1,46,1,46,3,46,960,8,46,1,46,3,46,963,8,46,1,46,3,46,966,
        8,46,1,46,1,46,3,46,970,8,46,1,46,1,46,1,46,1,46,3,46,976,8,46,1,
        46,1,46,3,46,980,8,46,1,46,3,46,983,8,46,1,46,3,46,986,8,46,1,46,
        1,46,1,46,1,46,3,46,992,8,46,1,46,3,46,995,8,46,1,46,3,46,998,8,
        46,1,46,1,46,3,46,1002,8,46,1,46,1,46,1,46,1,46,3,46,1008,8,46,1,
        46,3,46,1011,8,46,1,46,3,46,1014,8,46,1,46,1,46,3,46,1018,8,46,1,
        47,1,47,3,47,1022,8,47,1,47,1,47,3,47,1026,8,47,3,47,1028,8,47,1,
        47,1,47,3,47,1032,8,47,3,47,1034,8,47,1,47,3,47,1037,8,47,1,47,1,
        47,3,47,1041,8,47,3,47,1043,8,47,1,47,1,47,1,48,1,48,3,48,1049,8,
        48,1,49,1,49,3,49,1053,8,49,1,49,1,49,3,49,1057,8,49,1,49,1,49,3,
        49,1061,8,49,1,49,3,49,1064,8,49,1,49,5,49,1067,8,49,10,49,12,49,
        1070,9,49,1,50,1,50,3,50,1074,8,50,1,50,5,50,1077,8,50,10,50,12,
        50,1080,9,50,1,51,1,51,3,51,1084,8,51,1,51,1,51,1,52,1,52,3,52,1090,
        8,52,1,52,1,52,3,52,1094,8,52,3,52,1096,8,52,1,52,1,52,3,52,1100,
        8,52,1,52,1,52,3,52,1104,8,52,3,52,1106,8,52,3,52,1108,8,52,1,53,
        1,53,1,54,1,54,1,55,1,55,3,55,1116,8,55,1,55,4,55,1119,8,55,11,55,
        12,55,1120,1,56,1,56,1,57,1,57,1,57,1,57,1,57,5,57,1130,8,57,10,
        57,12,57,1133,9,57,1,58,1,58,1,58,1,58,1,58,5,58,1140,8,58,10,58,
        12,58,1143,9,58,1,59,1,59,1,59,1,59,1,59,5,59,1150,8,59,10,59,12,
        59,1153,9,59,1,60,1,60,3,60,1157,8,60,5,60,1159,8,60,10,60,12,60,
        1162,9,60,1,60,1,60,1,61,1,61,3,61,1168,8,61,1,61,5,61,1171,8,61,
        10,61,12,61,1174,9,61,1,62,1,62,3,62,1178,8,62,1,62,1,62,1,62,3,
        62,1183,8,62,1,62,1,62,1,62,3,62,1188,8,62,1,62,1,62,1,62,3,62,1193,
        8,62,1,62,1,62,1,62,3,62,1198,8,62,1,62,1,62,1,62,3,62,1203,8,62,
        1,62,3,62,1206,8,62,1,63,1,63,1,63,1,63,5,63,1212,8,63,10,63,12,
        63,1215,9,63,1,64,1,64,1,64,1,64,1,64,1,64,1,64,1,64,1,64,1,64,1,
        64,3,64,1228,8,64,1,64,3,64,1231,8,64,1,64,3,64,1234,8,64,1,64,1,
        64,1,65,1,65,1,65,3,65,1241,8,65,1,65,1,65,1,66,1,66,1,66,1,66,1,
        66,1,66,1,66,1,66,1,66,1,66,3,66,1255,8,66,1,67,1,67,3,67,1259,8,
        67,1,67,1,67,3,67,1263,8,67,1,67,1,67,3,67,1267,8,67,1,67,1,67,3,
        67,1271,8,67,1,67,5,67,1274,8,67,10,67,12,67,1277,9,67,1,68,1,68,
        3,68,1281,8,68,1,68,1,68,3,68,1285,8,68,1,68,1,68,3,68,1289,8,68,
        1,68,1,68,3,68,1293,8,68,1,68,1,68,3,68,1297,8,68,1,68,1,68,3,68,
        1301,8,68,1,68,5,68,1304,8,68,10,68,12,68,1307,9,68,1,69,1,69,3,
        69,1311,8,69,1,69,1,69,3,69,1315,8,69,1,69,5,69,1318,8,69,10,69,
        12,69,1321,9,69,1,70,1,70,1,70,3,70,1326,8,70,1,70,3,70,1329,8,70,
        1,71,1,71,3,71,1333,8,71,1,71,1,71,3,71,1337,8,71,1,71,5,71,1340,
        8,71,10,71,12,71,1343,9,71,1,71,3,71,1346,8,71,1,71,3,71,1349,8,
        71,1,72,1,72,1,72,1,72,1,72,1,72,3,72,1357,8,72,1,72,1,72,3,72,1361,
        8,72,1,72,3,72,1364,8,72,1,73,1,73,3,73,1368,8,73,1,73,1,73,1,74,
        1,74,1,74,1,74,1,74,1,74,3,74,1378,8,74,1,74,1,74,3,74,1382,8,74,
        1,74,1,74,3,74,1386,8,74,1,74,1,74,1,74,1,74,1,74,1,74,1,74,1,74,
        1,74,1,74,1,74,3,74,1399,8,74,1,75,1,75,3,75,1403,8,75,1,75,1,75,
        3,75,1407,8,75,1,75,1,75,3,75,1411,8,75,1,75,1,75,3,75,1415,8,75,
        1,75,1,75,3,75,1419,8,75,1,75,1,75,3,75,1423,8,75,1,75,1,75,3,75,
        1427,8,75,1,75,1,75,3,75,1431,8,75,1,75,1,75,3,75,1435,8,75,1,75,
        1,75,1,76,1,76,3,76,1441,8,76,1,76,1,76,3,76,1445,8,76,1,76,1,76,
        3,76,1449,8,76,1,76,1,76,3,76,1453,8,76,1,76,1,76,3,76,1457,8,76,
        5,76,1459,8,76,10,76,12,76,1462,9,76,3,76,1464,8,76,1,76,1,76,1,
        77,1,77,3,77,1470,8,77,1,77,1,77,3,77,1474,8,77,1,77,1,77,1,77,1,
        77,3,77,1480,8,77,1,77,1,77,1,77,3,77,1485,8,77,1,77,1,77,3,77,1489,
        8,77,1,78,1,78,3,78,1493,8,78,1,78,4,78,1496,8,78,11,78,12,78,1497,
        1,78,1,78,3,78,1502,8,78,1,78,1,78,3,78,1506,8,78,1,78,4,78,1509,
        8,78,11,78,12,78,1510,3,78,1513,8,78,1,78,3,78,1516,8,78,1,78,1,
        78,3,78,1520,8,78,1,78,3,78,1523,8,78,1,78,3,78,1526,8,78,1,78,1,
        78,1,79,1,79,3,79,1532,8,79,1,79,1,79,3,79,1536,8,79,1,79,1,79,3,
        79,1540,8,79,1,79,1,79,1,80,1,80,3,80,1546,8,80,1,80,1,80,3,80,1550,
        8,80,1,80,1,80,3,80,1554,8,80,1,80,3,80,1557,8,80,1,80,3,80,1560,
        8,80,1,80,1,80,1,81,1,81,3,81,1566,8,81,1,81,1,81,3,81,1570,8,81,
        1,81,1,81,3,81,1574,8,81,3,81,1576,8,81,1,81,1,81,3,81,1580,8,81,
        1,81,1,81,3,81,1584,8,81,3,81,1586,8,81,1,81,1,81,3,81,1590,8,81,
        1,81,1,81,3,81,1594,8,81,1,81,1,81,1,82,1,82,3,82,1600,8,82,1,82,
        1,82,3,82,1604,8,82,1,82,1,82,3,82,1608,8,82,1,82,1,82,1,82,1,82,
        3,82,1614,8,82,1,82,1,82,3,82,1618,8,82,1,82,1,82,3,82,1622,8,82,
        1,82,1,82,1,82,1,82,3,82,1628,8,82,1,82,1,82,3,82,1632,8,82,1,82,
        1,82,3,82,1636,8,82,1,82,1,82,1,82,1,82,3,82,1642,8,82,1,82,1,82,
        3,82,1646,8,82,1,82,1,82,3,82,1650,8,82,1,82,1,82,3,82,1654,8,82,
        1,83,1,83,3,83,1658,8,83,1,83,3,83,1661,8,83,1,84,1,84,1,85,1,85,
        3,85,1667,8,85,1,85,1,85,3,85,1671,8,85,1,85,1,85,1,86,1,86,1,86,
        1,86,1,86,1,86,1,87,1,87,3,87,1683,8,87,1,87,1,87,3,87,1687,8,87,
        1,87,1,87,3,87,1691,8,87,3,87,1693,8,87,1,87,1,87,3,87,1697,8,87,
        1,87,1,87,3,87,1701,8,87,1,87,1,87,3,87,1705,8,87,5,87,1707,8,87,
        10,87,12,87,1710,9,87,3,87,1712,8,87,1,87,1,87,1,88,1,88,1,88,1,
        89,1,89,3,89,1721,8,89,1,89,1,89,3,89,1725,8,89,1,89,1,89,1,89,1,
        89,3,89,1731,8,89,1,89,3,89,1734,8,89,3,89,1736,8,89,1,89,3,89,1739,
        8,89,1,89,1,89,1,90,1,90,3,90,1745,8,90,1,90,1,90,3,90,1749,8,90,
        1,90,1,90,1,90,1,90,3,90,1755,8,90,1,90,3,90,1758,8,90,3,90,1760,
        8,90,1,90,3,90,1763,8,90,1,90,1,90,1,91,1,91,3,91,1769,8,91,1,91,
        5,91,1772,8,91,10,91,12,91,1775,9,91,1,92,1,92,3,92,1779,8,92,1,
        92,1,92,3,92,1783,8,92,1,92,1,92,3,92,1787,8,92,1,92,1,92,3,92,1791,
        8,92,1,92,1,92,3,92,1795,8,92,5,92,1797,8,92,10,92,12,92,1800,9,
        92,3,92,1802,8,92,1,92,1,92,1,93,1,93,1,94,1,94,1,95,1,95,1,95,1,
        96,1,96,1,96,5,96,1816,8,96,10,96,12,96,1819,9,96,1,97,1,97,3,97,
        1823,8,97,1,98,1,98,1,99,1,99,1,99,1,99,1,99,1,99,3,99,1833,8,99,
        1,100,1,100,1,101,1,101,3,101,1839,8,101,1,102,1,102,1,103,1,103,
        1,104,1,104,3,104,1847,8,104,1,104,1,104,3,104,1851,8,104,1,104,
        1,104,3,104,1855,8,104,1,104,1,104,3,104,1859,8,104,5,104,1861,8,
        104,10,104,12,104,1864,9,104,3,104,1866,8,104,1,104,1,104,1,105,
        1,105,3,105,1872,8,105,1,105,1,105,3,105,1876,8,105,1,105,1,105,
        3,105,1880,8,105,1,105,1,105,3,105,1884,8,105,1,105,1,105,3,105,
        1888,8,105,1,105,1,105,3,105,1892,8,105,1,105,1,105,3,105,1896,8,
        105,1,105,1,105,3,105,1900,8,105,5,105,1902,8,105,10,105,12,105,
        1905,9,105,3,105,1907,8,105,1,105,1,105,1,106,1,106,1,107,1,107,
        1,107,1,107,1,107,3,107,1918,8,107,1,108,1,108,3,108,1922,8,108,
        1,109,1,109,1,110,1,110,1,111,1,111,1,112,1,112,1,113,1,113,1,113,
        0,0,114,0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,
        42,44,46,48,50,52,54,56,58,60,62,64,66,68,70,72,74,76,78,80,82,84,
        86,88,90,92,94,96,98,100,102,104,106,108,110,112,114,116,118,120,
        122,124,126,128,130,132,134,136,138,140,142,144,146,148,150,152,
        154,156,158,160,162,164,166,168,170,172,174,176,178,180,182,184,
        186,188,190,192,194,196,198,200,202,204,206,208,210,212,214,216,
        218,220,222,224,226,0,12,1,0,51,52,1,0,73,76,2,0,11,11,22,22,7,0,
        47,48,53,77,80,88,92,96,100,100,117,123,125,126,1,0,101,102,1,0,
        103,105,1,0,113,114,7,0,47,48,53,63,66,77,80,89,92,96,100,102,117,
        126,8,0,49,52,78,79,90,91,97,99,106,106,124,124,127,129,132,132,
        2,0,17,17,28,31,2,0,18,18,32,35,2,0,22,22,36,46,2236,0,229,1,0,0,
        0,2,243,1,0,0,0,4,247,1,0,0,0,6,249,1,0,0,0,8,271,1,0,0,0,10,275,
        1,0,0,0,12,330,1,0,0,0,14,348,1,0,0,0,16,361,1,0,0,0,18,363,1,0,
        0,0,20,397,1,0,0,0,22,401,1,0,0,0,24,463,1,0,0,0,26,476,1,0,0,0,
        28,486,1,0,0,0,30,508,1,0,0,0,32,510,1,0,0,0,34,516,1,0,0,0,36,570,
        1,0,0,0,38,574,1,0,0,0,40,594,1,0,0,0,42,614,1,0,0,0,44,616,1,0,
        0,0,46,627,1,0,0,0,48,644,1,0,0,0,50,669,1,0,0,0,52,673,1,0,0,0,
        54,681,1,0,0,0,56,688,1,0,0,0,58,732,1,0,0,0,60,741,1,0,0,0,62,743,
        1,0,0,0,64,758,1,0,0,0,66,762,1,0,0,0,68,766,1,0,0,0,70,773,1,0,
        0,0,72,777,1,0,0,0,74,802,1,0,0,0,76,806,1,0,0,0,78,836,1,0,0,0,
        80,859,1,0,0,0,82,861,1,0,0,0,84,881,1,0,0,0,86,890,1,0,0,0,88,914,
        1,0,0,0,90,951,1,0,0,0,92,1017,1,0,0,0,94,1019,1,0,0,0,96,1048,1,
        0,0,0,98,1050,1,0,0,0,100,1071,1,0,0,0,102,1081,1,0,0,0,104,1087,
        1,0,0,0,106,1109,1,0,0,0,108,1111,1,0,0,0,110,1113,1,0,0,0,112,1122,
        1,0,0,0,114,1124,1,0,0,0,116,1134,1,0,0,0,118,1144,1,0,0,0,120,1160,
        1,0,0,0,122,1165,1,0,0,0,124,1205,1,0,0,0,126,1207,1,0,0,0,128,1230,
        1,0,0,0,130,1237,1,0,0,0,132,1254,1,0,0,0,134,1256,1,0,0,0,136,1278,
        1,0,0,0,138,1308,1,0,0,0,140,1328,1,0,0,0,142,1330,1,0,0,0,144,1363,
        1,0,0,0,146,1365,1,0,0,0,148,1398,1,0,0,0,150,1400,1,0,0,0,152,1438,
        1,0,0,0,154,1488,1,0,0,0,156,1512,1,0,0,0,158,1529,1,0,0,0,160,1543,
        1,0,0,0,162,1563,1,0,0,0,164,1653,1,0,0,0,166,1655,1,0,0,0,168,1662,
        1,0,0,0,170,1664,1,0,0,0,172,1674,1,0,0,0,174,1680,1,0,0,0,176,1715,
        1,0,0,0,178,1718,1,0,0,0,180,1742,1,0,0,0,182,1766,1,0,0,0,184,1776,
        1,0,0,0,186,1805,1,0,0,0,188,1807,1,0,0,0,190,1809,1,0,0,0,192,1817,
        1,0,0,0,194,1822,1,0,0,0,196,1824,1,0,0,0,198,1832,1,0,0,0,200,1834,
        1,0,0,0,202,1838,1,0,0,0,204,1840,1,0,0,0,206,1842,1,0,0,0,208,1844,
        1,0,0,0,210,1869,1,0,0,0,212,1910,1,0,0,0,214,1912,1,0,0,0,216,1921,
        1,0,0,0,218,1923,1,0,0,0,220,1925,1,0,0,0,222,1927,1,0,0,0,224,1929,
        1,0,0,0,226,1931,1,0,0,0,228,230,5,133,0,0,229,228,1,0,0,0,229,230,
        1,0,0,0,230,231,1,0,0,0,231,236,3,2,1,0,232,234,5,133,0,0,233,232,
        1,0,0,0,233,234,1,0,0,0,234,235,1,0,0,0,235,237,5,1,0,0,236,233,
        1,0,0,0,236,237,1,0,0,0,237,239,1,0,0,0,238,240,5,133,0,0,239,238,
        1,0,0,0,239,240,1,0,0,0,240,241,1,0,0,0,241,242,5,0,0,1,242,1,1,
        0,0,0,243,244,3,4,2,0,244,3,1,0,0,0,245,248,3,6,3,0,246,248,3,46,
        23,0,247,245,1,0,0,0,247,246,1,0,0,0,248,5,1,0,0,0,249,256,3,10,
        5,0,250,252,5,133,0,0,251,250,1,0,0,0,251,252,1,0,0,0,252,253,1,
        0,0,0,253,255,3,8,4,0,254,251,1,0,0,0,255,258,1,0,0,0,256,254,1,
        0,0,0,256,257,1,0,0,0,257,7,1,0,0,0,258,256,1,0,0,0,259,260,5,47,
        0,0,260,261,5,133,0,0,261,263,5,48,0,0,262,264,5,133,0,0,263,262,
        1,0,0,0,263,264,1,0,0,0,264,265,1,0,0,0,265,272,3,10,5,0,266,268,
        5,47,0,0,267,269,5,133,0,0,268,267,1,0,0,0,268,269,1,0,0,0,269,270,
        1,0,0,0,270,272,3,10,5,0,271,259,1,0,0,0,271,266,1,0,0,0,272,9,1,
        0,0,0,273,276,3,12,6,0,274,276,3,14,7,0,275,273,1,0,0,0,275,274,
        1,0,0,0,276,11,1,0,0,0,277,279,3,20,10,0,278,280,5,133,0,0,279,278,
        1,0,0,0,279,280,1,0,0,0,280,282,1,0,0,0,281,277,1,0,0,0,282,285,
        1,0,0,0,283,281,1,0,0,0,283,284,1,0,0,0,284,286,1,0,0,0,285,283,
        1,0,0,0,286,331,3,54,27,0,287,289,3,20,10,0,288,290,5,133,0,0,289,
        288,1,0,0,0,289,290,1,0,0,0,290,292,1,0,0,0,291,287,1,0,0,0,292,
        295,1,0,0,0,293,291,1,0,0,0,293,294,1,0,0,0,294,296,1,0,0,0,295,
        293,1,0,0,0,296,312,3,16,8,0,297,299,5,133,0,0,298,297,1,0,0,0,298,
        299,1,0,0,0,299,300,1,0,0,0,300,302,3,20,10,0,301,298,1,0,0,0,302,
        305,1,0,0,0,303,301,1,0,0,0,303,304,1,0,0,0,304,307,1,0,0,0,305,
        303,1,0,0,0,306,308,5,133,0,0,307,306,1,0,0,0,307,308,1,0,0,0,308,
        309,1,0,0,0,309,311,3,16,8,0,310,303,1,0,0,0,311,314,1,0,0,0,312,
        310,1,0,0,0,312,313,1,0,0,0,313,328,1,0,0,0,314,312,1,0,0,0,315,
        317,5,133,0,0,316,315,1,0,0,0,316,317,1,0,0,0,317,318,1,0,0,0,318,
        320,3,20,10,0,319,316,1,0,0,0,320,323,1,0,0,0,321,319,1,0,0,0,321,
        322,1,0,0,0,322,325,1,0,0,0,323,321,1,0,0,0,324,326,5,133,0,0,325,
        324,1,0,0,0,325,326,1,0,0,0,326,327,1,0,0,0,327,329,3,54,27,0,328,
        321,1,0,0,0,328,329,1,0,0,0,329,331,1,0,0,0,330,283,1,0,0,0,330,
        293,1,0,0,0,331,13,1,0,0,0,332,335,3,20,10,0,333,335,3,16,8,0,334,
        332,1,0,0,0,334,333,1,0,0,0,335,337,1,0,0,0,336,338,5,133,0,0,337,
        336,1,0,0,0,337,338,1,0,0,0,338,340,1,0,0,0,339,334,1,0,0,0,340,
        343,1,0,0,0,341,339,1,0,0,0,341,342,1,0,0,0,342,344,1,0,0,0,343,
        341,1,0,0,0,344,346,3,52,26,0,345,347,5,133,0,0,346,345,1,0,0,0,
        346,347,1,0,0,0,347,349,1,0,0,0,348,341,1,0,0,0,349,350,1,0,0,0,
        350,348,1,0,0,0,350,351,1,0,0,0,351,352,1,0,0,0,352,353,3,12,6,0,
        353,15,1,0,0,0,354,362,3,32,16,0,355,362,3,28,14,0,356,362,3,38,
        19,0,357,362,3,34,17,0,358,362,3,40,20,0,359,362,3,18,9,0,360,362,
        3,22,11,0,361,354,1,0,0,0,361,355,1,0,0,0,361,356,1,0,0,0,361,357,
        1,0,0,0,361,358,1,0,0,0,361,359,1,0,0,0,361,360,1,0,0,0,362,17,1,
        0,0,0,363,365,5,49,0,0,364,366,5,133,0,0,365,364,1,0,0,0,365,366,
        1,0,0,0,366,367,1,0,0,0,367,369,5,2,0,0,368,370,5,133,0,0,369,368,
        1,0,0,0,369,370,1,0,0,0,370,371,1,0,0,0,371,372,3,194,97,0,372,373,
        5,133,0,0,373,374,5,87,0,0,374,375,5,133,0,0,375,377,3,112,56,0,
        376,378,5,133,0,0,377,376,1,0,0,0,377,378,1,0,0,0,378,379,1,0,0,
        0,379,384,5,3,0,0,380,382,5,133,0,0,381,380,1,0,0,0,381,382,1,0,
        0,0,382,383,1,0,0,0,383,385,3,16,8,0,384,381,1,0,0,0,385,386,1,0,
        0,0,386,384,1,0,0,0,386,387,1,0,0,0,387,389,1,0,0,0,388,390,5,133,
        0,0,389,388,1,0,0,0,389,390,1,0,0,0,390,391,1,0,0,0,391,392,5,4,
        0,0,392,19,1,0,0,0,393,398,3,24,12,0,394,398,3,26,13,0,395,398,3,
        22,11,0,396,398,3,44,22,0,397,393,1,0,0,0,397,394,1,0,0,0,397,395,
        1,0,0,0,397,396,1,0,0,0,398,21,1,0,0,0,399,400,5,53,0,0,400,402,
        5,133,0,0,401,399,1,0,0,0,401,402,1,0,0,0,402,403,1,0,0,0,403,405,
        5,64,0,0,404,406,5,133,0,0,405,404,1,0,0,0,405,406,1,0,0,0,406,435,
        1,0,0,0,407,409,5,2,0,0,408,410,5,133,0,0,409,408,1,0,0,0,409,410,
        1,0,0,0,410,426,1,0,0,0,411,427,5,5,0,0,412,423,3,194,97,0,413,415,
        5,133,0,0,414,413,1,0,0,0,414,415,1,0,0,0,415,416,1,0,0,0,416,418,
        5,6,0,0,417,419,5,133,0,0,418,417,1,0,0,0,418,419,1,0,0,0,419,420,
        1,0,0,0,420,422,3,194,97,0,421,414,1,0,0,0,422,425,1,0,0,0,423,421,
        1,0,0,0,423,424,1,0,0,0,424,427,1,0,0,0,425,423,1,0,0,0,426,411,
        1,0,0,0,426,412,1,0,0,0,426,427,1,0,0,0,427,429,1,0,0,0,428,430,
        5,133,0,0,429,428,1,0,0,0,429,430,1,0,0,0,430,431,1,0,0,0,431,433,
        5,4,0,0,432,434,5,133,0,0,433,432,1,0,0,0,433,434,1,0,0,0,434,436,
        1,0,0,0,435,407,1,0,0,0,435,436,1,0,0,0,436,437,1,0,0,0,437,439,
        5,7,0,0,438,440,5,133,0,0,439,438,1,0,0,0,439,440,1,0,0,0,440,441,
        1,0,0,0,441,443,3,6,3,0,442,444,5,133,0,0,443,442,1,0,0,0,443,444,
        1,0,0,0,444,445,1,0,0,0,445,459,5,8,0,0,446,447,5,133,0,0,447,448,
        5,87,0,0,448,449,5,133,0,0,449,457,5,50,0,0,450,451,5,133,0,0,451,
        452,5,124,0,0,452,453,5,133,0,0,453,454,3,112,56,0,454,455,5,133,
        0,0,455,456,7,0,0,0,456,458,1,0,0,0,457,450,1,0,0,0,457,458,1,0,
        0,0,458,460,1,0,0,0,459,446,1,0,0,0,459,460,1,0,0,0,460,23,1,0,0,
        0,461,462,5,53,0,0,462,464,5,133,0,0,463,461,1,0,0,0,463,464,1,0,
        0,0,464,465,1,0,0,0,465,467,5,54,0,0,466,468,5,133,0,0,467,466,1,
        0,0,0,467,468,1,0,0,0,468,469,1,0,0,0,469,474,3,72,36,0,470,472,
        5,133,0,0,471,470,1,0,0,0,471,472,1,0,0,0,472,473,1,0,0,0,473,475,
        3,70,35,0,474,471,1,0,0,0,474,475,1,0,0,0,475,25,1,0,0,0,476,478,
        5,55,0,0,477,479,5,133,0,0,478,477,1,0,0,0,478,479,1,0,0,0,479,480,
        1,0,0,0,480,481,3,112,56,0,481,482,5,133,0,0,482,483,5,56,0,0,483,
        484,5,133,0,0,484,485,3,194,97,0,485,27,1,0,0,0,486,488,5,57,0,0,
        487,489,5,133,0,0,488,487,1,0,0,0,488,489,1,0,0,0,489,490,1,0,0,
        0,490,495,3,74,37,0,491,492,5,133,0,0,492,494,3,30,15,0,493,491,
        1,0,0,0,494,497,1,0,0,0,495,493,1,0,0,0,495,496,1,0,0,0,496,29,1,
        0,0,0,497,495,1,0,0,0,498,499,5,58,0,0,499,500,5,133,0,0,500,501,
        5,54,0,0,501,502,5,133,0,0,502,509,3,34,17,0,503,504,5,58,0,0,504,
        505,5,133,0,0,505,506,5,59,0,0,506,507,5,133,0,0,507,509,3,34,17,
        0,508,498,1,0,0,0,508,503,1,0,0,0,509,31,1,0,0,0,510,512,5,59,0,
        0,511,513,5,133,0,0,512,511,1,0,0,0,512,513,1,0,0,0,513,514,1,0,
        0,0,514,515,3,72,36,0,515,33,1,0,0,0,516,518,5,60,0,0,517,519,5,
        133,0,0,518,517,1,0,0,0,518,519,1,0,0,0,519,520,1,0,0,0,520,531,
        3,36,18,0,521,523,5,133,0,0,522,521,1,0,0,0,522,523,1,0,0,0,523,
        524,1,0,0,0,524,526,5,6,0,0,525,527,5,133,0,0,526,525,1,0,0,0,526,
        527,1,0,0,0,527,528,1,0,0,0,528,530,3,36,18,0,529,522,1,0,0,0,530,
        533,1,0,0,0,531,529,1,0,0,0,531,532,1,0,0,0,532,35,1,0,0,0,533,531,
        1,0,0,0,534,536,3,110,55,0,535,537,5,133,0,0,536,535,1,0,0,0,536,
        537,1,0,0,0,537,538,1,0,0,0,538,540,5,9,0,0,539,541,5,133,0,0,540,
        539,1,0,0,0,540,541,1,0,0,0,541,542,1,0,0,0,542,543,3,112,56,0,543,
        571,1,0,0,0,544,546,3,194,97,0,545,547,5,133,0,0,546,545,1,0,0,0,
        546,547,1,0,0,0,547,548,1,0,0,0,548,550,5,9,0,0,549,551,5,133,0,
        0,550,549,1,0,0,0,550,551,1,0,0,0,551,552,1,0,0,0,552,553,3,112,
        56,0,553,571,1,0,0,0,554,556,3,194,97,0,555,557,5,133,0,0,556,555,
        1,0,0,0,556,557,1,0,0,0,557,558,1,0,0,0,558,560,5,10,0,0,559,561,
        5,133,0,0,560,559,1,0,0,0,560,561,1,0,0,0,561,562,1,0,0,0,562,563,
        3,112,56,0,563,571,1,0,0,0,564,566,3,194,97,0,565,567,5,133,0,0,
        566,565,1,0,0,0,566,567,1,0,0,0,567,568,1,0,0,0,568,569,3,100,50,
        0,569,571,1,0,0,0,570,534,1,0,0,0,570,544,1,0,0,0,570,554,1,0,0,
        0,570,564,1,0,0,0,571,37,1,0,0,0,572,573,5,61,0,0,573,575,5,133,
        0,0,574,572,1,0,0,0,574,575,1,0,0,0,575,576,1,0,0,0,576,578,5,62,
        0,0,577,579,5,133,0,0,578,577,1,0,0,0,578,579,1,0,0,0,579,580,1,
        0,0,0,580,591,3,112,56,0,581,583,5,133,0,0,582,581,1,0,0,0,582,583,
        1,0,0,0,583,584,1,0,0,0,584,586,5,6,0,0,585,587,5,133,0,0,586,585,
        1,0,0,0,586,587,1,0,0,0,587,588,1,0,0,0,588,590,3,112,56,0,589,582,
        1,0,0,0,590,593,1,0,0,0,591,589,1,0,0,0,591,592,1,0,0,0,592,39,1,
        0,0,0,593,591,1,0,0,0,594,595,5,63,0,0,595,596,5,133,0,0,596,607,
        3,42,21,0,597,599,5,133,0,0,598,597,1,0,0,0,598,599,1,0,0,0,599,
        600,1,0,0,0,600,602,5,6,0,0,601,603,5,133,0,0,602,601,1,0,0,0,602,
        603,1,0,0,0,603,604,1,0,0,0,604,606,3,42,21,0,605,598,1,0,0,0,606,
        609,1,0,0,0,607,605,1,0,0,0,607,608,1,0,0,0,608,41,1,0,0,0,609,607,
        1,0,0,0,610,611,3,194,97,0,611,612,3,100,50,0,612,615,1,0,0,0,613,
        615,3,110,55,0,614,610,1,0,0,0,614,613,1,0,0,0,615,43,1,0,0,0,616,
        617,5,64,0,0,617,618,5,133,0,0,618,625,3,184,92,0,619,621,5,133,
        0,0,620,619,1,0,0,0,620,621,1,0,0,0,621,622,1,0,0,0,622,623,5,65,
        0,0,623,624,5,133,0,0,624,626,3,48,24,0,625,620,1,0,0,0,625,626,
        1,0,0,0,626,45,1,0,0,0,627,628,5,64,0,0,628,631,5,133,0,0,629,632,
        3,184,92,0,630,632,3,186,93,0,631,629,1,0,0,0,631,630,1,0,0,0,632,
        642,1,0,0,0,633,635,5,133,0,0,634,633,1,0,0,0,634,635,1,0,0,0,635,
        636,1,0,0,0,636,637,5,65,0,0,637,640,5,133,0,0,638,641,5,5,0,0,639,
        641,3,48,24,0,640,638,1,0,0,0,640,639,1,0,0,0,641,643,1,0,0,0,642,
        634,1,0,0,0,642,643,1,0,0,0,643,47,1,0,0,0,644,655,3,50,25,0,645,
        647,5,133,0,0,646,645,1,0,0,0,646,647,1,0,0,0,647,648,1,0,0,0,648,
        650,5,6,0,0,649,651,5,133,0,0,650,649,1,0,0,0,650,651,1,0,0,0,651,
        652,1,0,0,0,652,654,3,50,25,0,653,646,1,0,0,0,654,657,1,0,0,0,655,
        653,1,0,0,0,655,656,1,0,0,0,656,662,1,0,0,0,657,655,1,0,0,0,658,
        660,5,133,0,0,659,658,1,0,0,0,659,660,1,0,0,0,660,661,1,0,0,0,661,
        663,3,70,35,0,662,659,1,0,0,0,662,663,1,0,0,0,663,49,1,0,0,0,664,
        665,3,188,94,0,665,666,5,133,0,0,666,667,5,56,0,0,667,668,5,133,
        0,0,668,670,1,0,0,0,669,664,1,0,0,0,669,670,1,0,0,0,670,671,1,0,
        0,0,671,672,3,194,97,0,672,51,1,0,0,0,673,674,5,66,0,0,674,679,3,
        56,28,0,675,677,5,133,0,0,676,675,1,0,0,0,676,677,1,0,0,0,677,678,
        1,0,0,0,678,680,3,70,35,0,679,676,1,0,0,0,679,680,1,0,0,0,680,53,
        1,0,0,0,681,682,5,67,0,0,682,683,3,56,28,0,683,55,1,0,0,0,684,686,
        5,133,0,0,685,684,1,0,0,0,685,686,1,0,0,0,686,687,1,0,0,0,687,689,
        5,68,0,0,688,685,1,0,0,0,688,689,1,0,0,0,689,690,1,0,0,0,690,691,
        5,133,0,0,691,694,3,58,29,0,692,693,5,133,0,0,693,695,3,62,31,0,
        694,692,1,0,0,0,694,695,1,0,0,0,695,698,1,0,0,0,696,697,5,133,0,
        0,697,699,3,64,32,0,698,696,1,0,0,0,698,699,1,0,0,0,699,702,1,0,
        0,0,700,701,5,133,0,0,701,703,3,66,33,0,702,700,1,0,0,0,702,703,
        1,0,0,0,703,57,1,0,0,0,704,715,5,5,0,0,705,707,5,133,0,0,706,705,
        1,0,0,0,706,707,1,0,0,0,707,708,1,0,0,0,708,710,5,6,0,0,709,711,
        5,133,0,0,710,709,1,0,0,0,710,711,1,0,0,0,711,712,1,0,0,0,712,714,
        3,60,30,0,713,706,1,0,0,0,714,717,1,0,0,0,715,713,1,0,0,0,715,716,
        1,0,0,0,716,733,1,0,0,0,717,715,1,0,0,0,718,729,3,60,30,0,719,721,
        5,133,0,0,720,719,1,0,0,0,720,721,1,0,0,0,721,722,1,0,0,0,722,724,
        5,6,0,0,723,725,5,133,0,0,724,723,1,0,0,0,724,725,1,0,0,0,725,726,
        1,0,0,0,726,728,3,60,30,0,727,720,1,0,0,0,728,731,1,0,0,0,729,727,
        1,0,0,0,729,730,1,0,0,0,730,733,1,0,0,0,731,729,1,0,0,0,732,704,
        1,0,0,0,732,718,1,0,0,0,733,59,1,0,0,0,734,735,3,112,56,0,735,736,
        5,133,0,0,736,737,5,56,0,0,737,738,5,133,0,0,738,739,3,194,97,0,
        739,742,1,0,0,0,740,742,3,112,56,0,741,734,1,0,0,0,741,740,1,0,0,
        0,742,61,1,0,0,0,743,744,5,69,0,0,744,745,5,133,0,0,745,746,5,70,
        0,0,746,747,5,133,0,0,747,755,3,68,34,0,748,750,5,6,0,0,749,751,
        5,133,0,0,750,749,1,0,0,0,750,751,1,0,0,0,751,752,1,0,0,0,752,754,
        3,68,34,0,753,748,1,0,0,0,754,757,1,0,0,0,755,753,1,0,0,0,755,756,
        1,0,0,0,756,63,1,0,0,0,757,755,1,0,0,0,758,759,5,71,0,0,759,760,
        5,133,0,0,760,761,3,112,56,0,761,65,1,0,0,0,762,763,5,72,0,0,763,
        764,5,133,0,0,764,765,3,112,56,0,765,67,1,0,0,0,766,771,3,112,56,
        0,767,769,5,133,0,0,768,767,1,0,0,0,768,769,1,0,0,0,769,770,1,0,
        0,0,770,772,7,1,0,0,771,768,1,0,0,0,771,772,1,0,0,0,772,69,1,0,0,
        0,773,774,5,77,0,0,774,775,5,133,0,0,775,776,3,112,56,0,776,71,1,
        0,0,0,777,788,3,74,37,0,778,780,5,133,0,0,779,778,1,0,0,0,779,780,
        1,0,0,0,780,781,1,0,0,0,781,783,5,6,0,0,782,784,5,133,0,0,783,782,
        1,0,0,0,783,784,1,0,0,0,784,785,1,0,0,0,785,787,3,74,37,0,786,779,
        1,0,0,0,787,790,1,0,0,0,788,786,1,0,0,0,788,789,1,0,0,0,789,73,1,
        0,0,0,790,788,1,0,0,0,791,793,3,194,97,0,792,794,5,133,0,0,793,792,
        1,0,0,0,793,794,1,0,0,0,794,795,1,0,0,0,795,797,5,9,0,0,796,798,
        5,133,0,0,797,796,1,0,0,0,797,798,1,0,0,0,798,799,1,0,0,0,799,800,
        3,76,38,0,800,803,1,0,0,0,801,803,3,76,38,0,802,791,1,0,0,0,802,
        801,1,0,0,0,803,75,1,0,0,0,804,807,3,78,39,0,805,807,3,80,40,0,806,
        804,1,0,0,0,806,805,1,0,0,0,807,77,1,0,0,0,808,810,5,78,0,0,809,
        811,5,133,0,0,810,809,1,0,0,0,810,811,1,0,0,0,811,812,1,0,0,0,812,
        814,5,2,0,0,813,815,5,133,0,0,814,813,1,0,0,0,814,815,1,0,0,0,815,
        816,1,0,0,0,816,818,3,80,40,0,817,819,5,133,0,0,818,817,1,0,0,0,
        818,819,1,0,0,0,819,820,1,0,0,0,820,821,5,4,0,0,821,837,1,0,0,0,
        822,824,5,79,0,0,823,825,5,133,0,0,824,823,1,0,0,0,824,825,1,0,0,
        0,825,826,1,0,0,0,826,828,5,2,0,0,827,829,5,133,0,0,828,827,1,0,
        0,0,828,829,1,0,0,0,829,830,1,0,0,0,830,832,3,80,40,0,831,833,5,
        133,0,0,832,831,1,0,0,0,832,833,1,0,0,0,833,834,1,0,0,0,834,835,
        5,4,0,0,835,837,1,0,0,0,836,808,1,0,0,0,836,822,1,0,0,0,837,79,1,
        0,0,0,838,841,3,86,43,0,839,841,3,82,41,0,840,838,1,0,0,0,840,839,
        1,0,0,0,841,852,1,0,0,0,842,844,5,133,0,0,843,842,1,0,0,0,843,844,
        1,0,0,0,844,848,1,0,0,0,845,849,3,88,44,0,846,849,3,82,41,0,847,
        849,3,86,43,0,848,845,1,0,0,0,848,846,1,0,0,0,848,847,1,0,0,0,849,
        851,1,0,0,0,850,843,1,0,0,0,851,854,1,0,0,0,852,850,1,0,0,0,852,
        853,1,0,0,0,853,860,1,0,0,0,854,852,1,0,0,0,855,856,5,2,0,0,856,
        857,3,80,40,0,857,858,5,4,0,0,858,860,1,0,0,0,859,840,1,0,0,0,859,
        855,1,0,0,0,860,81,1,0,0,0,861,863,5,2,0,0,862,864,5,133,0,0,863,
        862,1,0,0,0,863,864,1,0,0,0,864,865,1,0,0,0,865,870,3,80,40,0,866,
        868,5,133,0,0,867,866,1,0,0,0,867,868,1,0,0,0,868,869,1,0,0,0,869,
        871,3,70,35,0,870,867,1,0,0,0,870,871,1,0,0,0,871,873,1,0,0,0,872,
        874,5,133,0,0,873,872,1,0,0,0,873,874,1,0,0,0,874,875,1,0,0,0,875,
        877,5,4,0,0,876,878,5,133,0,0,877,876,1,0,0,0,877,878,1,0,0,0,878,
        879,1,0,0,0,879,880,3,90,45,0,880,83,1,0,0,0,881,886,3,86,43,0,882,
        884,5,133,0,0,883,882,1,0,0,0,883,884,1,0,0,0,884,885,1,0,0,0,885,
        887,3,88,44,0,886,883,1,0,0,0,887,888,1,0,0,0,888,886,1,0,0,0,888,
        889,1,0,0,0,889,85,1,0,0,0,890,892,5,2,0,0,891,893,5,133,0,0,892,
        891,1,0,0,0,892,893,1,0,0,0,893,898,1,0,0,0,894,896,3,194,97,0,895,
        897,5,133,0,0,896,895,1,0,0,0,896,897,1,0,0,0,897,899,1,0,0,0,898,
        894,1,0,0,0,898,899,1,0,0,0,899,904,1,0,0,0,900,902,3,100,50,0,901,
        903,5,133,0,0,902,901,1,0,0,0,902,903,1,0,0,0,903,905,1,0,0,0,904,
        900,1,0,0,0,904,905,1,0,0,0,905,910,1,0,0,0,906,908,3,96,48,0,907,
        909,5,133,0,0,908,907,1,0,0,0,908,909,1,0,0,0,909,911,1,0,0,0,910,
        906,1,0,0,0,910,911,1,0,0,0,911,912,1,0,0,0,912,913,5,4,0,0,913,
        87,1,0,0,0,914,919,3,92,46,0,915,917,5,133,0,0,916,915,1,0,0,0,916,
        917,1,0,0,0,917,918,1,0,0,0,918,920,3,90,45,0,919,916,1,0,0,0,919,
        920,1,0,0,0,920,922,1,0,0,0,921,923,5,133,0,0,922,921,1,0,0,0,922,
        923,1,0,0,0,923,924,1,0,0,0,924,925,3,86,43,0,925,89,1,0,0,0,926,
        952,5,11,0,0,927,952,5,5,0,0,928,930,5,7,0,0,929,931,5,133,0,0,930,
        929,1,0,0,0,930,931,1,0,0,0,931,933,1,0,0,0,932,934,3,204,102,0,
        933,932,1,0,0,0,933,934,1,0,0,0,934,936,1,0,0,0,935,937,5,133,0,
        0,936,935,1,0,0,0,936,937,1,0,0,0,937,948,1,0,0,0,938,940,5,6,0,
        0,939,941,5,133,0,0,940,939,1,0,0,0,940,941,1,0,0,0,941,943,1,0,
        0,0,942,944,3,204,102,0,943,942,1,0,0,0,943,944,1,0,0,0,944,946,
        1,0,0,0,945,947,5,133,0,0,946,945,1,0,0,0,946,947,1,0,0,0,947,949,
        1,0,0,0,948,938,1,0,0,0,948,949,1,0,0,0,949,950,1,0,0,0,950,952,
        5,8,0,0,951,926,1,0,0,0,951,927,1,0,0,0,951,928,1,0,0,0,952,91,1,
        0,0,0,953,955,3,222,111,0,954,956,5,133,0,0,955,954,1,0,0,0,955,
        956,1,0,0,0,956,957,1,0,0,0,957,959,3,226,113,0,958,960,5,133,0,
        0,959,958,1,0,0,0,959,960,1,0,0,0,960,962,1,0,0,0,961,963,3,94,47,
        0,962,961,1,0,0,0,962,963,1,0,0,0,963,965,1,0,0,0,964,966,5,133,
        0,0,965,964,1,0,0,0,965,966,1,0,0,0,966,967,1,0,0,0,967,969,3,226,
        113,0,968,970,5,133,0,0,969,968,1,0,0,0,969,970,1,0,0,0,970,971,
        1,0,0,0,971,972,3,224,112,0,972,1018,1,0,0,0,973,975,3,222,111,0,
        974,976,5,133,0,0,975,974,1,0,0,0,975,976,1,0,0,0,976,977,1,0,0,
        0,977,979,3,226,113,0,978,980,5,133,0,0,979,978,1,0,0,0,979,980,
        1,0,0,0,980,982,1,0,0,0,981,983,3,94,47,0,982,981,1,0,0,0,982,983,
        1,0,0,0,983,985,1,0,0,0,984,986,5,133,0,0,985,984,1,0,0,0,985,986,
        1,0,0,0,986,987,1,0,0,0,987,988,3,226,113,0,988,1018,1,0,0,0,989,
        991,3,226,113,0,990,992,5,133,0,0,991,990,1,0,0,0,991,992,1,0,0,
        0,992,994,1,0,0,0,993,995,3,94,47,0,994,993,1,0,0,0,994,995,1,0,
        0,0,995,997,1,0,0,0,996,998,5,133,0,0,997,996,1,0,0,0,997,998,1,
        0,0,0,998,999,1,0,0,0,999,1001,3,226,113,0,1000,1002,5,133,0,0,1001,
        1000,1,0,0,0,1001,1002,1,0,0,0,1002,1003,1,0,0,0,1003,1004,3,224,
        112,0,1004,1018,1,0,0,0,1005,1007,3,226,113,0,1006,1008,5,133,0,
        0,1007,1006,1,0,0,0,1007,1008,1,0,0,0,1008,1010,1,0,0,0,1009,1011,
        3,94,47,0,1010,1009,1,0,0,0,1010,1011,1,0,0,0,1011,1013,1,0,0,0,
        1012,1014,5,133,0,0,1013,1012,1,0,0,0,1013,1014,1,0,0,0,1014,1015,
        1,0,0,0,1015,1016,3,226,113,0,1016,1018,1,0,0,0,1017,953,1,0,0,0,
        1017,973,1,0,0,0,1017,989,1,0,0,0,1017,1005,1,0,0,0,1018,93,1,0,
        0,0,1019,1021,5,12,0,0,1020,1022,5,133,0,0,1021,1020,1,0,0,0,1021,
        1022,1,0,0,0,1022,1027,1,0,0,0,1023,1025,3,194,97,0,1024,1026,5,
        133,0,0,1025,1024,1,0,0,0,1025,1026,1,0,0,0,1026,1028,1,0,0,0,1027,
        1023,1,0,0,0,1027,1028,1,0,0,0,1028,1033,1,0,0,0,1029,1031,3,98,
        49,0,1030,1032,5,133,0,0,1031,1030,1,0,0,0,1031,1032,1,0,0,0,1032,
        1034,1,0,0,0,1033,1029,1,0,0,0,1033,1034,1,0,0,0,1034,1036,1,0,0,
        0,1035,1037,3,104,52,0,1036,1035,1,0,0,0,1036,1037,1,0,0,0,1037,
        1042,1,0,0,0,1038,1040,3,96,48,0,1039,1041,5,133,0,0,1040,1039,1,
        0,0,0,1040,1041,1,0,0,0,1041,1043,1,0,0,0,1042,1038,1,0,0,0,1042,
        1043,1,0,0,0,1043,1044,1,0,0,0,1044,1045,5,13,0,0,1045,95,1,0,0,
        0,1046,1049,3,210,105,0,1047,1049,3,214,107,0,1048,1046,1,0,0,0,
        1048,1047,1,0,0,0,1049,97,1,0,0,0,1050,1052,5,14,0,0,1051,1053,5,
        133,0,0,1052,1051,1,0,0,0,1052,1053,1,0,0,0,1053,1054,1,0,0,0,1054,
        1068,3,108,54,0,1055,1057,5,133,0,0,1056,1055,1,0,0,0,1056,1057,
        1,0,0,0,1057,1058,1,0,0,0,1058,1060,5,3,0,0,1059,1061,5,14,0,0,1060,
        1059,1,0,0,0,1060,1061,1,0,0,0,1061,1063,1,0,0,0,1062,1064,5,133,
        0,0,1063,1062,1,0,0,0,1063,1064,1,0,0,0,1064,1065,1,0,0,0,1065,1067,
        3,108,54,0,1066,1056,1,0,0,0,1067,1070,1,0,0,0,1068,1066,1,0,0,0,
        1068,1069,1,0,0,0,1069,99,1,0,0,0,1070,1068,1,0,0,0,1071,1078,3,
        102,51,0,1072,1074,5,133,0,0,1073,1072,1,0,0,0,1073,1074,1,0,0,0,
        1074,1075,1,0,0,0,1075,1077,3,102,51,0,1076,1073,1,0,0,0,1077,1080,
        1,0,0,0,1078,1076,1,0,0,0,1078,1079,1,0,0,0,1079,101,1,0,0,0,1080,
        1078,1,0,0,0,1081,1083,5,14,0,0,1082,1084,5,133,0,0,1083,1082,1,
        0,0,0,1083,1084,1,0,0,0,1084,1085,1,0,0,0,1085,1086,3,106,53,0,1086,
        103,1,0,0,0,1087,1089,5,5,0,0,1088,1090,5,133,0,0,1089,1088,1,0,
        0,0,1089,1090,1,0,0,0,1090,1095,1,0,0,0,1091,1093,3,204,102,0,1092,
        1094,5,133,0,0,1093,1092,1,0,0,0,1093,1094,1,0,0,0,1094,1096,1,0,
        0,0,1095,1091,1,0,0,0,1095,1096,1,0,0,0,1096,1107,1,0,0,0,1097,1099,
        5,15,0,0,1098,1100,5,133,0,0,1099,1098,1,0,0,0,1099,1100,1,0,0,0,
        1100,1105,1,0,0,0,1101,1103,3,204,102,0,1102,1104,5,133,0,0,1103,
        1102,1,0,0,0,1103,1104,1,0,0,0,1104,1106,1,0,0,0,1105,1101,1,0,0,
        0,1105,1106,1,0,0,0,1106,1108,1,0,0,0,1107,1097,1,0,0,0,1107,1108,
        1,0,0,0,1108,105,1,0,0,0,1109,1110,3,216,108,0,1110,107,1,0,0,0,
        1111,1112,3,216,108,0,1112,109,1,0,0,0,1113,1118,3,148,74,0,1114,
        1116,5,133,0,0,1115,1114,1,0,0,0,1115,1116,1,0,0,0,1116,1117,1,0,
        0,0,1117,1119,3,146,73,0,1118,1115,1,0,0,0,1119,1120,1,0,0,0,1120,
        1118,1,0,0,0,1120,1121,1,0,0,0,1121,111,1,0,0,0,1122,1123,3,114,
        57,0,1123,113,1,0,0,0,1124,1131,3,116,58,0,1125,1126,5,133,0,0,1126,
        1127,5,80,0,0,1127,1128,5,133,0,0,1128,1130,3,116,58,0,1129,1125,
        1,0,0,0,1130,1133,1,0,0,0,1131,1129,1,0,0,0,1131,1132,1,0,0,0,1132,
        115,1,0,0,0,1133,1131,1,0,0,0,1134,1141,3,118,59,0,1135,1136,5,133,
        0,0,1136,1137,5,81,0,0,1137,1138,5,133,0,0,1138,1140,3,118,59,0,
        1139,1135,1,0,0,0,1140,1143,1,0,0,0,1141,1139,1,0,0,0,1141,1142,
        1,0,0,0,1142,117,1,0,0,0,1143,1141,1,0,0,0,1144,1151,3,120,60,0,
        1145,1146,5,133,0,0,1146,1147,5,82,0,0,1147,1148,5,133,0,0,1148,
        1150,3,120,60,0,1149,1145,1,0,0,0,1150,1153,1,0,0,0,1151,1149,1,
        0,0,0,1151,1152,1,0,0,0,1152,119,1,0,0,0,1153,1151,1,0,0,0,1154,
        1156,5,83,0,0,1155,1157,5,133,0,0,1156,1155,1,0,0,0,1156,1157,1,
        0,0,0,1157,1159,1,0,0,0,1158,1154,1,0,0,0,1159,1162,1,0,0,0,1160,
        1158,1,0,0,0,1160,1161,1,0,0,0,1161,1163,1,0,0,0,1162,1160,1,0,0,
        0,1163,1164,3,122,61,0,1164,121,1,0,0,0,1165,1172,3,126,63,0,1166,
        1168,5,133,0,0,1167,1166,1,0,0,0,1167,1168,1,0,0,0,1168,1169,1,0,
        0,0,1169,1171,3,124,62,0,1170,1167,1,0,0,0,1171,1174,1,0,0,0,1172,
        1170,1,0,0,0,1172,1173,1,0,0,0,1173,123,1,0,0,0,1174,1172,1,0,0,
        0,1175,1177,5,9,0,0,1176,1178,5,133,0,0,1177,1176,1,0,0,0,1177,1178,
        1,0,0,0,1178,1179,1,0,0,0,1179,1206,3,126,63,0,1180,1182,5,16,0,
        0,1181,1183,5,133,0,0,1182,1181,1,0,0,0,1182,1183,1,0,0,0,1183,1184,
        1,0,0,0,1184,1206,3,126,63,0,1185,1187,5,17,0,0,1186,1188,5,133,
        0,0,1187,1186,1,0,0,0,1187,1188,1,0,0,0,1188,1189,1,0,0,0,1189,1206,
        3,126,63,0,1190,1192,5,18,0,0,1191,1193,5,133,0,0,1192,1191,1,0,
        0,0,1192,1193,1,0,0,0,1193,1194,1,0,0,0,1194,1206,3,126,63,0,1195,
        1197,5,19,0,0,1196,1198,5,133,0,0,1197,1196,1,0,0,0,1197,1198,1,
        0,0,0,1198,1199,1,0,0,0,1199,1206,3,126,63,0,1200,1202,5,20,0,0,
        1201,1203,5,133,0,0,1202,1201,1,0,0,0,1202,1203,1,0,0,0,1203,1204,
        1,0,0,0,1204,1206,3,126,63,0,1205,1175,1,0,0,0,1205,1180,1,0,0,0,
        1205,1185,1,0,0,0,1205,1190,1,0,0,0,1205,1195,1,0,0,0,1205,1200,
        1,0,0,0,1206,125,1,0,0,0,1207,1213,3,134,67,0,1208,1212,3,128,64,
        0,1209,1212,3,130,65,0,1210,1212,3,132,66,0,1211,1208,1,0,0,0,1211,
        1209,1,0,0,0,1211,1210,1,0,0,0,1212,1215,1,0,0,0,1213,1211,1,0,0,
        0,1213,1214,1,0,0,0,1214,127,1,0,0,0,1215,1213,1,0,0,0,1216,1217,
        5,133,0,0,1217,1218,5,84,0,0,1218,1219,5,133,0,0,1219,1231,5,66,
        0,0,1220,1221,5,133,0,0,1221,1222,5,85,0,0,1222,1223,5,133,0,0,1223,
        1231,5,66,0,0,1224,1225,5,133,0,0,1225,1231,5,86,0,0,1226,1228,5,
        133,0,0,1227,1226,1,0,0,0,1227,1228,1,0,0,0,1228,1229,1,0,0,0,1229,
        1231,5,21,0,0,1230,1216,1,0,0,0,1230,1220,1,0,0,0,1230,1224,1,0,
        0,0,1230,1227,1,0,0,0,1231,1233,1,0,0,0,1232,1234,5,133,0,0,1233,
        1232,1,0,0,0,1233,1234,1,0,0,0,1234,1235,1,0,0,0,1235,1236,3,134,
        67,0,1236,129,1,0,0,0,1237,1238,5,133,0,0,1238,1240,5,87,0,0,1239,
        1241,5,133,0,0,1240,1239,1,0,0,0,1240,1241,1,0,0,0,1241,1242,1,0,
        0,0,1242,1243,3,134,67,0,1243,131,1,0,0,0,1244,1245,5,133,0,0,1245,
        1246,5,88,0,0,1246,1247,5,133,0,0,1247,1255,5,89,0,0,1248,1249,5,
        133,0,0,1249,1250,5,88,0,0,1250,1251,5,133,0,0,1251,1252,5,83,0,
        0,1252,1253,5,133,0,0,1253,1255,5,89,0,0,1254,1244,1,0,0,0,1254,
        1248,1,0,0,0,1255,133,1,0,0,0,1256,1275,3,136,68,0,1257,1259,5,133,
        0,0,1258,1257,1,0,0,0,1258,1259,1,0,0,0,1259,1260,1,0,0,0,1260,1262,
        5,11,0,0,1261,1263,5,133,0,0,1262,1261,1,0,0,0,1262,1263,1,0,0,0,
        1263,1264,1,0,0,0,1264,1274,3,136,68,0,1265,1267,5,133,0,0,1266,
        1265,1,0,0,0,1266,1267,1,0,0,0,1267,1268,1,0,0,0,1268,1270,5,22,
        0,0,1269,1271,5,133,0,0,1270,1269,1,0,0,0,1270,1271,1,0,0,0,1271,
        1272,1,0,0,0,1272,1274,3,136,68,0,1273,1258,1,0,0,0,1273,1266,1,
        0,0,0,1274,1277,1,0,0,0,1275,1273,1,0,0,0,1275,1276,1,0,0,0,1276,
        135,1,0,0,0,1277,1275,1,0,0,0,1278,1305,3,138,69,0,1279,1281,5,133,
        0,0,1280,1279,1,0,0,0,1280,1281,1,0,0,0,1281,1282,1,0,0,0,1282,1284,
        5,5,0,0,1283,1285,5,133,0,0,1284,1283,1,0,0,0,1284,1285,1,0,0,0,
        1285,1286,1,0,0,0,1286,1304,3,138,69,0,1287,1289,5,133,0,0,1288,
        1287,1,0,0,0,1288,1289,1,0,0,0,1289,1290,1,0,0,0,1290,1292,5,23,
        0,0,1291,1293,5,133,0,0,1292,1291,1,0,0,0,1292,1293,1,0,0,0,1293,
        1294,1,0,0,0,1294,1304,3,138,69,0,1295,1297,5,133,0,0,1296,1295,
        1,0,0,0,1296,1297,1,0,0,0,1297,1298,1,0,0,0,1298,1300,5,24,0,0,1299,
        1301,5,133,0,0,1300,1299,1,0,0,0,1300,1301,1,0,0,0,1301,1302,1,0,
        0,0,1302,1304,3,138,69,0,1303,1280,1,0,0,0,1303,1288,1,0,0,0,1303,
        1296,1,0,0,0,1304,1307,1,0,0,0,1305,1303,1,0,0,0,1305,1306,1,0,0,
        0,1306,137,1,0,0,0,1307,1305,1,0,0,0,1308,1319,3,140,70,0,1309,1311,
        5,133,0,0,1310,1309,1,0,0,0,1310,1311,1,0,0,0,1311,1312,1,0,0,0,
        1312,1314,5,25,0,0,1313,1315,5,133,0,0,1314,1313,1,0,0,0,1314,1315,
        1,0,0,0,1315,1316,1,0,0,0,1316,1318,3,140,70,0,1317,1310,1,0,0,0,
        1318,1321,1,0,0,0,1319,1317,1,0,0,0,1319,1320,1,0,0,0,1320,139,1,
        0,0,0,1321,1319,1,0,0,0,1322,1329,3,142,71,0,1323,1325,7,2,0,0,1324,
        1326,5,133,0,0,1325,1324,1,0,0,0,1325,1326,1,0,0,0,1326,1327,1,0,
        0,0,1327,1329,3,142,71,0,1328,1322,1,0,0,0,1328,1323,1,0,0,0,1329,
        141,1,0,0,0,1330,1341,3,148,74,0,1331,1333,5,133,0,0,1332,1331,1,
        0,0,0,1332,1333,1,0,0,0,1333,1334,1,0,0,0,1334,1340,3,144,72,0,1335,
        1337,5,133,0,0,1336,1335,1,0,0,0,1336,1337,1,0,0,0,1337,1338,1,0,
        0,0,1338,1340,3,146,73,0,1339,1332,1,0,0,0,1339,1336,1,0,0,0,1340,
        1343,1,0,0,0,1341,1339,1,0,0,0,1341,1342,1,0,0,0,1342,1348,1,0,0,
        0,1343,1341,1,0,0,0,1344,1346,5,133,0,0,1345,1344,1,0,0,0,1345,1346,
        1,0,0,0,1346,1347,1,0,0,0,1347,1349,3,100,50,0,1348,1345,1,0,0,0,
        1348,1349,1,0,0,0,1349,143,1,0,0,0,1350,1351,5,12,0,0,1351,1352,
        3,112,56,0,1352,1353,5,13,0,0,1353,1364,1,0,0,0,1354,1356,5,12,0,
        0,1355,1357,3,112,56,0,1356,1355,1,0,0,0,1356,1357,1,0,0,0,1357,
        1358,1,0,0,0,1358,1360,5,15,0,0,1359,1361,3,112,56,0,1360,1359,1,
        0,0,0,1360,1361,1,0,0,0,1361,1362,1,0,0,0,1362,1364,5,13,0,0,1363,
        1350,1,0,0,0,1363,1354,1,0,0,0,1364,145,1,0,0,0,1365,1367,5,26,0,
        0,1366,1368,5,133,0,0,1367,1366,1,0,0,0,1367,1368,1,0,0,0,1368,1369,
        1,0,0,0,1369,1370,3,212,106,0,1370,147,1,0,0,0,1371,1399,3,198,99,
        0,1372,1399,3,214,107,0,1373,1399,3,156,78,0,1374,1399,3,180,90,
        0,1375,1377,5,91,0,0,1376,1378,5,133,0,0,1377,1376,1,0,0,0,1377,
        1378,1,0,0,0,1378,1379,1,0,0,0,1379,1381,5,2,0,0,1380,1382,5,133,
        0,0,1381,1380,1,0,0,0,1381,1382,1,0,0,0,1382,1383,1,0,0,0,1383,1385,
        5,5,0,0,1384,1386,5,133,0,0,1385,1384,1,0,0,0,1385,1386,1,0,0,0,
        1386,1387,1,0,0,0,1387,1399,5,4,0,0,1388,1399,3,160,80,0,1389,1399,
        3,162,81,0,1390,1399,3,164,82,0,1391,1399,3,150,75,0,1392,1399,3,
        168,84,0,1393,1399,3,170,85,0,1394,1399,3,174,87,0,1395,1399,3,178,
        89,0,1396,1399,3,152,76,0,1397,1399,3,194,97,0,1398,1371,1,0,0,0,
        1398,1372,1,0,0,0,1398,1373,1,0,0,0,1398,1374,1,0,0,0,1398,1375,
        1,0,0,0,1398,1388,1,0,0,0,1398,1389,1,0,0,0,1398,1390,1,0,0,0,1398,
        1391,1,0,0,0,1398,1392,1,0,0,0,1398,1393,1,0,0,0,1398,1394,1,0,0,
        0,1398,1395,1,0,0,0,1398,1396,1,0,0,0,1398,1397,1,0,0,0,1399,149,
        1,0,0,0,1400,1402,5,90,0,0,1401,1403,5,133,0,0,1402,1401,1,0,0,0,
        1402,1403,1,0,0,0,1403,1404,1,0,0,0,1404,1406,5,2,0,0,1405,1407,
        5,133,0,0,1406,1405,1,0,0,0,1406,1407,1,0,0,0,1407,1408,1,0,0,0,
        1408,1410,3,194,97,0,1409,1411,5,133,0,0,1410,1409,1,0,0,0,1410,
        1411,1,0,0,0,1411,1412,1,0,0,0,1412,1414,5,9,0,0,1413,1415,5,133,
        0,0,1414,1413,1,0,0,0,1414,1415,1,0,0,0,1415,1416,1,0,0,0,1416,1418,
        3,112,56,0,1417,1419,5,133,0,0,1418,1417,1,0,0,0,1418,1419,1,0,0,
        0,1419,1420,1,0,0,0,1420,1422,5,6,0,0,1421,1423,5,133,0,0,1422,1421,
        1,0,0,0,1422,1423,1,0,0,0,1423,1424,1,0,0,0,1424,1426,3,172,86,0,
        1425,1427,5,133,0,0,1426,1425,1,0,0,0,1426,1427,1,0,0,0,1427,1428,
        1,0,0,0,1428,1430,5,3,0,0,1429,1431,5,133,0,0,1430,1429,1,0,0,0,
        1430,1431,1,0,0,0,1431,1432,1,0,0,0,1432,1434,3,112,56,0,1433,1435,
        5,133,0,0,1434,1433,1,0,0,0,1434,1435,1,0,0,0,1435,1436,1,0,0,0,
        1436,1437,5,4,0,0,1437,151,1,0,0,0,1438,1440,3,194,97,0,1439,1441,
        5,133,0,0,1440,1439,1,0,0,0,1440,1441,1,0,0,0,1441,1442,1,0,0,0,
        1442,1444,5,7,0,0,1443,1445,5,133,0,0,1444,1443,1,0,0,0,1444,1445,
        1,0,0,0,1445,1463,1,0,0,0,1446,1448,3,154,77,0,1447,1449,5,133,0,
        0,1448,1447,1,0,0,0,1448,1449,1,0,0,0,1449,1460,1,0,0,0,1450,1452,
        5,6,0,0,1451,1453,5,133,0,0,1452,1451,1,0,0,0,1452,1453,1,0,0,0,
        1453,1454,1,0,0,0,1454,1456,3,154,77,0,1455,1457,5,133,0,0,1456,
        1455,1,0,0,0,1456,1457,1,0,0,0,1457,1459,1,0,0,0,1458,1450,1,0,0,
        0,1459,1462,1,0,0,0,1460,1458,1,0,0,0,1460,1461,1,0,0,0,1461,1464,
        1,0,0,0,1462,1460,1,0,0,0,1463,1446,1,0,0,0,1463,1464,1,0,0,0,1464,
        1465,1,0,0,0,1465,1466,5,8,0,0,1466,153,1,0,0,0,1467,1469,3,212,
        106,0,1468,1470,5,133,0,0,1469,1468,1,0,0,0,1469,1470,1,0,0,0,1470,
        1471,1,0,0,0,1471,1473,5,14,0,0,1472,1474,5,133,0,0,1473,1472,1,
        0,0,0,1473,1474,1,0,0,0,1474,1475,1,0,0,0,1475,1476,3,112,56,0,1476,
        1489,1,0,0,0,1477,1479,5,26,0,0,1478,1480,5,133,0,0,1479,1478,1,
        0,0,0,1479,1480,1,0,0,0,1480,1481,1,0,0,0,1481,1489,3,212,106,0,
        1482,1484,5,26,0,0,1483,1485,5,133,0,0,1484,1483,1,0,0,0,1484,1485,
        1,0,0,0,1485,1486,1,0,0,0,1486,1489,5,5,0,0,1487,1489,3,194,97,0,
        1488,1467,1,0,0,0,1488,1477,1,0,0,0,1488,1482,1,0,0,0,1488,1487,
        1,0,0,0,1489,155,1,0,0,0,1490,1495,5,92,0,0,1491,1493,5,133,0,0,
        1492,1491,1,0,0,0,1492,1493,1,0,0,0,1493,1494,1,0,0,0,1494,1496,
        3,158,79,0,1495,1492,1,0,0,0,1496,1497,1,0,0,0,1497,1495,1,0,0,0,
        1497,1498,1,0,0,0,1498,1513,1,0,0,0,1499,1501,5,92,0,0,1500,1502,
        5,133,0,0,1501,1500,1,0,0,0,1501,1502,1,0,0,0,1502,1503,1,0,0,0,
        1503,1508,3,112,56,0,1504,1506,5,133,0,0,1505,1504,1,0,0,0,1505,
        1506,1,0,0,0,1506,1507,1,0,0,0,1507,1509,3,158,79,0,1508,1505,1,
        0,0,0,1509,1510,1,0,0,0,1510,1508,1,0,0,0,1510,1511,1,0,0,0,1511,
        1513,1,0,0,0,1512,1490,1,0,0,0,1512,1499,1,0,0,0,1513,1522,1,0,0,
        0,1514,1516,5,133,0,0,1515,1514,1,0,0,0,1515,1516,1,0,0,0,1516,1517,
        1,0,0,0,1517,1519,5,93,0,0,1518,1520,5,133,0,0,1519,1518,1,0,0,0,
        1519,1520,1,0,0,0,1520,1521,1,0,0,0,1521,1523,3,112,56,0,1522,1515,
        1,0,0,0,1522,1523,1,0,0,0,1523,1525,1,0,0,0,1524,1526,5,133,0,0,
        1525,1524,1,0,0,0,1525,1526,1,0,0,0,1526,1527,1,0,0,0,1527,1528,
        5,94,0,0,1528,157,1,0,0,0,1529,1531,5,95,0,0,1530,1532,5,133,0,0,
        1531,1530,1,0,0,0,1531,1532,1,0,0,0,1532,1533,1,0,0,0,1533,1535,
        3,112,56,0,1534,1536,5,133,0,0,1535,1534,1,0,0,0,1535,1536,1,0,0,
        0,1536,1537,1,0,0,0,1537,1539,5,96,0,0,1538,1540,5,133,0,0,1539,
        1538,1,0,0,0,1539,1540,1,0,0,0,1540,1541,1,0,0,0,1541,1542,3,112,
        56,0,1542,159,1,0,0,0,1543,1545,5,12,0,0,1544,1546,5,133,0,0,1545,
        1544,1,0,0,0,1545,1546,1,0,0,0,1546,1547,1,0,0,0,1547,1556,3,166,
        83,0,1548,1550,5,133,0,0,1549,1548,1,0,0,0,1549,1550,1,0,0,0,1550,
        1551,1,0,0,0,1551,1553,5,3,0,0,1552,1554,5,133,0,0,1553,1552,1,0,
        0,0,1553,1554,1,0,0,0,1554,1555,1,0,0,0,1555,1557,3,112,56,0,1556,
        1549,1,0,0,0,1556,1557,1,0,0,0,1557,1559,1,0,0,0,1558,1560,5,133,
        0,0,1559,1558,1,0,0,0,1559,1560,1,0,0,0,1560,1561,1,0,0,0,1561,1562,
        5,13,0,0,1562,161,1,0,0,0,1563,1565,5,12,0,0,1564,1566,5,133,0,0,
        1565,1564,1,0,0,0,1565,1566,1,0,0,0,1566,1575,1,0,0,0,1567,1569,
        3,194,97,0,1568,1570,5,133,0,0,1569,1568,1,0,0,0,1569,1570,1,0,0,
        0,1570,1571,1,0,0,0,1571,1573,5,9,0,0,1572,1574,5,133,0,0,1573,1572,
        1,0,0,0,1573,1574,1,0,0,0,1574,1576,1,0,0,0,1575,1567,1,0,0,0,1575,
        1576,1,0,0,0,1576,1577,1,0,0,0,1577,1579,3,84,42,0,1578,1580,5,133,
        0,0,1579,1578,1,0,0,0,1579,1580,1,0,0,0,1580,1585,1,0,0,0,1581,1583,
        3,70,35,0,1582,1584,5,133,0,0,1583,1582,1,0,0,0,1583,1584,1,0,0,
        0,1584,1586,1,0,0,0,1585,1581,1,0,0,0,1585,1586,1,0,0,0,1586,1587,
        1,0,0,0,1587,1589,5,3,0,0,1588,1590,5,133,0,0,1589,1588,1,0,0,0,
        1589,1590,1,0,0,0,1590,1591,1,0,0,0,1591,1593,3,112,56,0,1592,1594,
        5,133,0,0,1593,1592,1,0,0,0,1593,1594,1,0,0,0,1594,1595,1,0,0,0,
        1595,1596,5,13,0,0,1596,163,1,0,0,0,1597,1599,5,48,0,0,1598,1600,
        5,133,0,0,1599,1598,1,0,0,0,1599,1600,1,0,0,0,1600,1601,1,0,0,0,
        1601,1603,5,2,0,0,1602,1604,5,133,0,0,1603,1602,1,0,0,0,1603,1604,
        1,0,0,0,1604,1605,1,0,0,0,1605,1607,3,166,83,0,1606,1608,5,133,0,
        0,1607,1606,1,0,0,0,1607,1608,1,0,0,0,1608,1609,1,0,0,0,1609,1610,
        5,4,0,0,1610,1654,1,0,0,0,1611,1613,5,97,0,0,1612,1614,5,133,0,0,
        1613,1612,1,0,0,0,1613,1614,1,0,0,0,1614,1615,1,0,0,0,1615,1617,
        5,2,0,0,1616,1618,5,133,0,0,1617,1616,1,0,0,0,1617,1618,1,0,0,0,
        1618,1619,1,0,0,0,1619,1621,3,166,83,0,1620,1622,5,133,0,0,1621,
        1620,1,0,0,0,1621,1622,1,0,0,0,1622,1623,1,0,0,0,1623,1624,5,4,0,
        0,1624,1654,1,0,0,0,1625,1627,5,98,0,0,1626,1628,5,133,0,0,1627,
        1626,1,0,0,0,1627,1628,1,0,0,0,1628,1629,1,0,0,0,1629,1631,5,2,0,
        0,1630,1632,5,133,0,0,1631,1630,1,0,0,0,1631,1632,1,0,0,0,1632,1633,
        1,0,0,0,1633,1635,3,166,83,0,1634,1636,5,133,0,0,1635,1634,1,0,0,
        0,1635,1636,1,0,0,0,1636,1637,1,0,0,0,1637,1638,5,4,0,0,1638,1654,
        1,0,0,0,1639,1641,5,99,0,0,1640,1642,5,133,0,0,1641,1640,1,0,0,0,
        1641,1642,1,0,0,0,1642,1643,1,0,0,0,1643,1645,5,2,0,0,1644,1646,
        5,133,0,0,1645,1644,1,0,0,0,1645,1646,1,0,0,0,1646,1647,1,0,0,0,
        1647,1649,3,166,83,0,1648,1650,5,133,0,0,1649,1648,1,0,0,0,1649,
        1650,1,0,0,0,1650,1651,1,0,0,0,1651,1652,5,4,0,0,1652,1654,1,0,0,
        0,1653,1597,1,0,0,0,1653,1611,1,0,0,0,1653,1625,1,0,0,0,1653,1639,
        1,0,0,0,1654,165,1,0,0,0,1655,1660,3,172,86,0,1656,1658,5,133,0,
        0,1657,1656,1,0,0,0,1657,1658,1,0,0,0,1658,1659,1,0,0,0,1659,1661,
        3,70,35,0,1660,1657,1,0,0,0,1660,1661,1,0,0,0,1661,167,1,0,0,0,1662,
        1663,3,84,42,0,1663,169,1,0,0,0,1664,1666,5,2,0,0,1665,1667,5,133,
        0,0,1666,1665,1,0,0,0,1666,1667,1,0,0,0,1667,1668,1,0,0,0,1668,1670,
        3,112,56,0,1669,1671,5,133,0,0,1670,1669,1,0,0,0,1670,1671,1,0,0,
        0,1671,1672,1,0,0,0,1672,1673,5,4,0,0,1673,171,1,0,0,0,1674,1675,
        3,194,97,0,1675,1676,5,133,0,0,1676,1677,5,87,0,0,1677,1678,5,133,
        0,0,1678,1679,3,112,56,0,1679,173,1,0,0,0,1680,1682,3,176,88,0,1681,
        1683,5,133,0,0,1682,1681,1,0,0,0,1682,1683,1,0,0,0,1683,1684,1,0,
        0,0,1684,1686,5,2,0,0,1685,1687,5,133,0,0,1686,1685,1,0,0,0,1686,
        1687,1,0,0,0,1687,1692,1,0,0,0,1688,1690,5,68,0,0,1689,1691,5,133,
        0,0,1690,1689,1,0,0,0,1690,1691,1,0,0,0,1691,1693,1,0,0,0,1692,1688,
        1,0,0,0,1692,1693,1,0,0,0,1693,1711,1,0,0,0,1694,1696,3,112,56,0,
        1695,1697,5,133,0,0,1696,1695,1,0,0,0,1696,1697,1,0,0,0,1697,1708,
        1,0,0,0,1698,1700,5,6,0,0,1699,1701,5,133,0,0,1700,1699,1,0,0,0,
        1700,1701,1,0,0,0,1701,1702,1,0,0,0,1702,1704,3,112,56,0,1703,1705,
        5,133,0,0,1704,1703,1,0,0,0,1704,1705,1,0,0,0,1705,1707,1,0,0,0,
        1706,1698,1,0,0,0,1707,1710,1,0,0,0,1708,1706,1,0,0,0,1708,1709,
        1,0,0,0,1709,1712,1,0,0,0,1710,1708,1,0,0,0,1711,1694,1,0,0,0,1711,
        1712,1,0,0,0,1712,1713,1,0,0,0,1713,1714,5,4,0,0,1714,175,1,0,0,
        0,1715,1716,3,192,96,0,1716,1717,3,220,110,0,1717,177,1,0,0,0,1718,
        1720,5,100,0,0,1719,1721,5,133,0,0,1720,1719,1,0,0,0,1720,1721,1,
        0,0,0,1721,1722,1,0,0,0,1722,1724,5,7,0,0,1723,1725,5,133,0,0,1724,
        1723,1,0,0,0,1724,1725,1,0,0,0,1725,1735,1,0,0,0,1726,1736,3,6,3,
        0,1727,1736,3,182,91,0,1728,1733,3,72,36,0,1729,1731,5,133,0,0,1730,
        1729,1,0,0,0,1730,1731,1,0,0,0,1731,1732,1,0,0,0,1732,1734,3,70,
        35,0,1733,1730,1,0,0,0,1733,1734,1,0,0,0,1734,1736,1,0,0,0,1735,
        1726,1,0,0,0,1735,1727,1,0,0,0,1735,1728,1,0,0,0,1736,1738,1,0,0,
        0,1737,1739,5,133,0,0,1738,1737,1,0,0,0,1738,1739,1,0,0,0,1739,1740,
        1,0,0,0,1740,1741,5,8,0,0,1741,179,1,0,0,0,1742,1744,5,91,0,0,1743,
        1745,5,133,0,0,1744,1743,1,0,0,0,1744,1745,1,0,0,0,1745,1746,1,0,
        0,0,1746,1748,5,7,0,0,1747,1749,5,133,0,0,1748,1747,1,0,0,0,1748,
        1749,1,0,0,0,1749,1759,1,0,0,0,1750,1760,3,6,3,0,1751,1760,3,182,
        91,0,1752,1757,3,72,36,0,1753,1755,5,133,0,0,1754,1753,1,0,0,0,1754,
        1755,1,0,0,0,1755,1756,1,0,0,0,1756,1758,3,70,35,0,1757,1754,1,0,
        0,0,1757,1758,1,0,0,0,1758,1760,1,0,0,0,1759,1750,1,0,0,0,1759,1751,
        1,0,0,0,1759,1752,1,0,0,0,1760,1762,1,0,0,0,1761,1763,5,133,0,0,
        1762,1761,1,0,0,0,1762,1763,1,0,0,0,1763,1764,1,0,0,0,1764,1765,
        5,8,0,0,1765,181,1,0,0,0,1766,1773,3,20,10,0,1767,1769,5,133,0,0,
        1768,1767,1,0,0,0,1768,1769,1,0,0,0,1769,1770,1,0,0,0,1770,1772,
        3,20,10,0,1771,1768,1,0,0,0,1772,1775,1,0,0,0,1773,1771,1,0,0,0,
        1773,1774,1,0,0,0,1774,183,1,0,0,0,1775,1773,1,0,0,0,1776,1778,3,
        190,95,0,1777,1779,5,133,0,0,1778,1777,1,0,0,0,1778,1779,1,0,0,0,
        1779,1780,1,0,0,0,1780,1782,5,2,0,0,1781,1783,5,133,0,0,1782,1781,
        1,0,0,0,1782,1783,1,0,0,0,1783,1801,1,0,0,0,1784,1786,3,112,56,0,
        1785,1787,5,133,0,0,1786,1785,1,0,0,0,1786,1787,1,0,0,0,1787,1798,
        1,0,0,0,1788,1790,5,6,0,0,1789,1791,5,133,0,0,1790,1789,1,0,0,0,
        1790,1791,1,0,0,0,1791,1792,1,0,0,0,1792,1794,3,112,56,0,1793,1795,
        5,133,0,0,1794,1793,1,0,0,0,1794,1795,1,0,0,0,1795,1797,1,0,0,0,
        1796,1788,1,0,0,0,1797,1800,1,0,0,0,1798,1796,1,0,0,0,1798,1799,
        1,0,0,0,1799,1802,1,0,0,0,1800,1798,1,0,0,0,1801,1784,1,0,0,0,1801,
        1802,1,0,0,0,1802,1803,1,0,0,0,1803,1804,5,4,0,0,1804,185,1,0,0,
        0,1805,1806,3,190,95,0,1806,187,1,0,0,0,1807,1808,3,220,110,0,1808,
        189,1,0,0,0,1809,1810,3,192,96,0,1810,1811,3,220,110,0,1811,191,
        1,0,0,0,1812,1813,3,220,110,0,1813,1814,5,26,0,0,1814,1816,1,0,0,
        0,1815,1812,1,0,0,0,1816,1819,1,0,0,0,1817,1815,1,0,0,0,1817,1818,
        1,0,0,0,1818,193,1,0,0,0,1819,1817,1,0,0,0,1820,1823,3,220,110,0,
        1821,1823,3,196,98,0,1822,1820,1,0,0,0,1822,1821,1,0,0,0,1823,195,
        1,0,0,0,1824,1825,7,3,0,0,1825,197,1,0,0,0,1826,1833,3,200,100,0,
        1827,1833,5,89,0,0,1828,1833,3,202,101,0,1829,1833,5,115,0,0,1830,
        1833,3,208,104,0,1831,1833,3,210,105,0,1832,1826,1,0,0,0,1832,1827,
        1,0,0,0,1832,1828,1,0,0,0,1832,1829,1,0,0,0,1832,1830,1,0,0,0,1832,
        1831,1,0,0,0,1833,199,1,0,0,0,1834,1835,7,4,0,0,1835,201,1,0,0,0,
        1836,1839,3,206,103,0,1837,1839,3,204,102,0,1838,1836,1,0,0,0,1838,
        1837,1,0,0,0,1839,203,1,0,0,0,1840,1841,7,5,0,0,1841,205,1,0,0,0,
        1842,1843,7,6,0,0,1843,207,1,0,0,0,1844,1846,5,12,0,0,1845,1847,
        5,133,0,0,1846,1845,1,0,0,0,1846,1847,1,0,0,0,1847,1865,1,0,0,0,
        1848,1850,3,112,56,0,1849,1851,5,133,0,0,1850,1849,1,0,0,0,1850,
        1851,1,0,0,0,1851,1862,1,0,0,0,1852,1854,5,6,0,0,1853,1855,5,133,
        0,0,1854,1853,1,0,0,0,1854,1855,1,0,0,0,1855,1856,1,0,0,0,1856,1858,
        3,112,56,0,1857,1859,5,133,0,0,1858,1857,1,0,0,0,1858,1859,1,0,0,
        0,1859,1861,1,0,0,0,1860,1852,1,0,0,0,1861,1864,1,0,0,0,1862,1860,
        1,0,0,0,1862,1863,1,0,0,0,1863,1866,1,0,0,0,1864,1862,1,0,0,0,1865,
        1848,1,0,0,0,1865,1866,1,0,0,0,1866,1867,1,0,0,0,1867,1868,5,13,
        0,0,1868,209,1,0,0,0,1869,1871,5,7,0,0,1870,1872,5,133,0,0,1871,
        1870,1,0,0,0,1871,1872,1,0,0,0,1872,1906,1,0,0,0,1873,1875,3,212,
        106,0,1874,1876,5,133,0,0,1875,1874,1,0,0,0,1875,1876,1,0,0,0,1876,
        1877,1,0,0,0,1877,1879,5,14,0,0,1878,1880,5,133,0,0,1879,1878,1,
        0,0,0,1879,1880,1,0,0,0,1880,1881,1,0,0,0,1881,1883,3,112,56,0,1882,
        1884,5,133,0,0,1883,1882,1,0,0,0,1883,1884,1,0,0,0,1884,1903,1,0,
        0,0,1885,1887,5,6,0,0,1886,1888,5,133,0,0,1887,1886,1,0,0,0,1887,
        1888,1,0,0,0,1888,1889,1,0,0,0,1889,1891,3,212,106,0,1890,1892,5,
        133,0,0,1891,1890,1,0,0,0,1891,1892,1,0,0,0,1892,1893,1,0,0,0,1893,
        1895,5,14,0,0,1894,1896,5,133,0,0,1895,1894,1,0,0,0,1895,1896,1,
        0,0,0,1896,1897,1,0,0,0,1897,1899,3,112,56,0,1898,1900,5,133,0,0,
        1899,1898,1,0,0,0,1899,1900,1,0,0,0,1900,1902,1,0,0,0,1901,1885,
        1,0,0,0,1902,1905,1,0,0,0,1903,1901,1,0,0,0,1903,1904,1,0,0,0,1904,
        1907,1,0,0,0,1905,1903,1,0,0,0,1906,1873,1,0,0,0,1906,1907,1,0,0,
        0,1907,1908,1,0,0,0,1908,1909,5,8,0,0,1909,211,1,0,0,0,1910,1911,
        3,216,108,0,1911,213,1,0,0,0,1912,1917,5,27,0,0,1913,1918,3,216,
        108,0,1914,1918,5,64,0,0,1915,1918,5,65,0,0,1916,1918,5,104,0,0,
        1917,1913,1,0,0,0,1917,1914,1,0,0,0,1917,1915,1,0,0,0,1917,1916,
        1,0,0,0,1918,215,1,0,0,0,1919,1922,3,220,110,0,1920,1922,3,218,109,
        0,1921,1919,1,0,0,0,1921,1920,1,0,0,0,1922,217,1,0,0,0,1923,1924,
        7,7,0,0,1924,219,1,0,0,0,1925,1926,7,8,0,0,1926,221,1,0,0,0,1927,
        1928,7,9,0,0,1928,223,1,0,0,0,1929,1930,7,10,0,0,1930,225,1,0,0,
        0,1931,1932,7,11,0,0,1932,227,1,0,0,0,370,229,233,236,239,247,251,
        256,263,268,271,275,279,283,289,293,298,303,307,312,316,321,325,
        328,330,334,337,341,346,350,361,365,369,377,381,386,389,397,401,
        405,409,414,418,423,426,429,433,435,439,443,457,459,463,467,471,
        474,478,488,495,508,512,518,522,526,531,536,540,546,550,556,560,
        566,570,574,578,582,586,591,598,602,607,614,620,625,631,634,640,
        642,646,650,655,659,662,669,676,679,685,688,694,698,702,706,710,
        715,720,724,729,732,741,750,755,768,771,779,783,788,793,797,802,
        806,810,814,818,824,828,832,836,840,843,848,852,859,863,867,870,
        873,877,883,888,892,896,898,902,904,908,910,916,919,922,930,933,
        936,940,943,946,948,951,955,959,962,965,969,975,979,982,985,991,
        994,997,1001,1007,1010,1013,1017,1021,1025,1027,1031,1033,1036,1040,
        1042,1048,1052,1056,1060,1063,1068,1073,1078,1083,1089,1093,1095,
        1099,1103,1105,1107,1115,1120,1131,1141,1151,1156,1160,1167,1172,
        1177,1182,1187,1192,1197,1202,1205,1211,1213,1227,1230,1233,1240,
        1254,1258,1262,1266,1270,1273,1275,1280,1284,1288,1292,1296,1300,
        1303,1305,1310,1314,1319,1325,1328,1332,1336,1339,1341,1345,1348,
        1356,1360,1363,1367,1377,1381,1385,1398,1402,1406,1410,1414,1418,
        1422,1426,1430,1434,1440,1444,1448,1452,1456,1460,1463,1469,1473,
        1479,1484,1488,1492,1497,1501,1505,1510,1512,1515,1519,1522,1525,
        1531,1535,1539,1545,1549,1553,1556,1559,1565,1569,1573,1575,1579,
        1583,1585,1589,1593,1599,1603,1607,1613,1617,1621,1627,1631,1635,
        1641,1645,1649,1653,1657,1660,1666,1670,1682,1686,1690,1692,1696,
        1700,1704,1708,1711,1720,1724,1730,1733,1735,1738,1744,1748,1754,
        1757,1759,1762,1768,1773,1778,1782,1786,1790,1794,1798,1801,1817,
        1822,1832,1838,1846,1850,1854,1858,1862,1865,1871,1875,1879,1883,
        1887,1891,1895,1899,1903,1906,1917,1921
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!CypherParser.__ATN) {
            CypherParser.__ATN = new antlr.ATNDeserializer().deserialize(CypherParser._serializedATN);
        }

        return CypherParser.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(CypherParser.literalNames, CypherParser.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return CypherParser.vocabulary;
    }

    private static readonly decisionsToDFA = CypherParser._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}

export class OC_CypherContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Statement(): OC_StatementContext {
        return this.getRuleContext(0, OC_StatementContext)!;
    }
    public EOF(): antlr.TerminalNode {
        return this.getToken(CypherParser.EOF, 0)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Cypher;
    }
}


export class OC_StatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Query(): OC_QueryContext {
        return this.getRuleContext(0, OC_QueryContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Statement;
    }
}


export class OC_QueryContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_RegularQuery(): OC_RegularQueryContext | null {
        return this.getRuleContext(0, OC_RegularQueryContext);
    }
    public oC_StandaloneCall(): OC_StandaloneCallContext | null {
        return this.getRuleContext(0, OC_StandaloneCallContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Query;
    }
}


export class OC_RegularQueryContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_SingleQuery(): OC_SingleQueryContext {
        return this.getRuleContext(0, OC_SingleQueryContext)!;
    }
    public oC_Union(): OC_UnionContext[];
    public oC_Union(i: number): OC_UnionContext | null;
    public oC_Union(i?: number): OC_UnionContext[] | OC_UnionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_UnionContext);
        }

        return this.getRuleContext(i, OC_UnionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_RegularQuery;
    }
}


export class OC_UnionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public UNION(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.UNION, 0);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public ALL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ALL, 0);
    }
    public oC_SingleQuery(): OC_SingleQueryContext | null {
        return this.getRuleContext(0, OC_SingleQueryContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Union;
    }
}


export class OC_SingleQueryContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_SinglePartQuery(): OC_SinglePartQueryContext | null {
        return this.getRuleContext(0, OC_SinglePartQueryContext);
    }
    public oC_MultiPartQuery(): OC_MultiPartQueryContext | null {
        return this.getRuleContext(0, OC_MultiPartQueryContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_SingleQuery;
    }
}


export class OC_SinglePartQueryContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Return(): OC_ReturnContext | null {
        return this.getRuleContext(0, OC_ReturnContext);
    }
    public oC_ReadingClause(): OC_ReadingClauseContext[];
    public oC_ReadingClause(i: number): OC_ReadingClauseContext | null;
    public oC_ReadingClause(i?: number): OC_ReadingClauseContext[] | OC_ReadingClauseContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ReadingClauseContext);
        }

        return this.getRuleContext(i, OC_ReadingClauseContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_UpdatingClause(): OC_UpdatingClauseContext[];
    public oC_UpdatingClause(i: number): OC_UpdatingClauseContext | null;
    public oC_UpdatingClause(i?: number): OC_UpdatingClauseContext[] | OC_UpdatingClauseContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_UpdatingClauseContext);
        }

        return this.getRuleContext(i, OC_UpdatingClauseContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_SinglePartQuery;
    }
}


export class OC_MultiPartQueryContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_SinglePartQuery(): OC_SinglePartQueryContext {
        return this.getRuleContext(0, OC_SinglePartQueryContext)!;
    }
    public oC_With(): OC_WithContext[];
    public oC_With(i: number): OC_WithContext | null;
    public oC_With(i?: number): OC_WithContext[] | OC_WithContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_WithContext);
        }

        return this.getRuleContext(i, OC_WithContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_ReadingClause(): OC_ReadingClauseContext[];
    public oC_ReadingClause(i: number): OC_ReadingClauseContext | null;
    public oC_ReadingClause(i?: number): OC_ReadingClauseContext[] | OC_ReadingClauseContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ReadingClauseContext);
        }

        return this.getRuleContext(i, OC_ReadingClauseContext);
    }
    public oC_UpdatingClause(): OC_UpdatingClauseContext[];
    public oC_UpdatingClause(i: number): OC_UpdatingClauseContext | null;
    public oC_UpdatingClause(i?: number): OC_UpdatingClauseContext[] | OC_UpdatingClauseContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_UpdatingClauseContext);
        }

        return this.getRuleContext(i, OC_UpdatingClauseContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_MultiPartQuery;
    }
}


export class OC_UpdatingClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Create(): OC_CreateContext | null {
        return this.getRuleContext(0, OC_CreateContext);
    }
    public oC_Merge(): OC_MergeContext | null {
        return this.getRuleContext(0, OC_MergeContext);
    }
    public oC_Delete(): OC_DeleteContext | null {
        return this.getRuleContext(0, OC_DeleteContext);
    }
    public oC_Set(): OC_SetContext | null {
        return this.getRuleContext(0, OC_SetContext);
    }
    public oC_Remove(): OC_RemoveContext | null {
        return this.getRuleContext(0, OC_RemoveContext);
    }
    public oC_Foreach(): OC_ForeachContext | null {
        return this.getRuleContext(0, OC_ForeachContext);
    }
    public oC_SubqueryCall(): OC_SubqueryCallContext | null {
        return this.getRuleContext(0, OC_SubqueryCallContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_UpdatingClause;
    }
}


export class OC_ForeachContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public FOREACH(): antlr.TerminalNode {
        return this.getToken(CypherParser.FOREACH, 0)!;
    }
    public oC_Variable(): OC_VariableContext {
        return this.getRuleContext(0, OC_VariableContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public IN(): antlr.TerminalNode {
        return this.getToken(CypherParser.IN, 0)!;
    }
    public oC_Expression(): OC_ExpressionContext {
        return this.getRuleContext(0, OC_ExpressionContext)!;
    }
    public oC_UpdatingClause(): OC_UpdatingClauseContext[];
    public oC_UpdatingClause(i: number): OC_UpdatingClauseContext | null;
    public oC_UpdatingClause(i?: number): OC_UpdatingClauseContext[] | OC_UpdatingClauseContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_UpdatingClauseContext);
        }

        return this.getRuleContext(i, OC_UpdatingClauseContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Foreach;
    }
}


export class OC_ReadingClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Match(): OC_MatchContext | null {
        return this.getRuleContext(0, OC_MatchContext);
    }
    public oC_Unwind(): OC_UnwindContext | null {
        return this.getRuleContext(0, OC_UnwindContext);
    }
    public oC_SubqueryCall(): OC_SubqueryCallContext | null {
        return this.getRuleContext(0, OC_SubqueryCallContext);
    }
    public oC_InQueryCall(): OC_InQueryCallContext | null {
        return this.getRuleContext(0, OC_InQueryCallContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ReadingClause;
    }
}


export class OC_SubqueryCallContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CALL(): antlr.TerminalNode {
        return this.getToken(CypherParser.CALL, 0)!;
    }
    public oC_RegularQuery(): OC_RegularQueryContext {
        return this.getRuleContext(0, OC_RegularQueryContext)!;
    }
    public OPTIONAL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.OPTIONAL, 0);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public IN(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.IN, 0);
    }
    public TRANSACTIONS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.TRANSACTIONS, 0);
    }
    public OF(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.OF, 0);
    }
    public oC_Expression(): OC_ExpressionContext | null {
        return this.getRuleContext(0, OC_ExpressionContext);
    }
    public ROWS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ROWS, 0);
    }
    public ROW(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ROW, 0);
    }
    public oC_Variable(): OC_VariableContext[];
    public oC_Variable(i: number): OC_VariableContext | null;
    public oC_Variable(i?: number): OC_VariableContext[] | OC_VariableContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_VariableContext);
        }

        return this.getRuleContext(i, OC_VariableContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_SubqueryCall;
    }
}


export class OC_MatchContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public MATCH(): antlr.TerminalNode {
        return this.getToken(CypherParser.MATCH, 0)!;
    }
    public oC_Pattern(): OC_PatternContext {
        return this.getRuleContext(0, OC_PatternContext)!;
    }
    public OPTIONAL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.OPTIONAL, 0);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_Where(): OC_WhereContext | null {
        return this.getRuleContext(0, OC_WhereContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Match;
    }
}


export class OC_UnwindContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public UNWIND(): antlr.TerminalNode {
        return this.getToken(CypherParser.UNWIND, 0)!;
    }
    public oC_Expression(): OC_ExpressionContext {
        return this.getRuleContext(0, OC_ExpressionContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public AS(): antlr.TerminalNode {
        return this.getToken(CypherParser.AS, 0)!;
    }
    public oC_Variable(): OC_VariableContext {
        return this.getRuleContext(0, OC_VariableContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Unwind;
    }
}


export class OC_MergeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public MERGE(): antlr.TerminalNode {
        return this.getToken(CypherParser.MERGE, 0)!;
    }
    public oC_PatternPart(): OC_PatternPartContext {
        return this.getRuleContext(0, OC_PatternPartContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_MergeAction(): OC_MergeActionContext[];
    public oC_MergeAction(i: number): OC_MergeActionContext | null;
    public oC_MergeAction(i?: number): OC_MergeActionContext[] | OC_MergeActionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_MergeActionContext);
        }

        return this.getRuleContext(i, OC_MergeActionContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Merge;
    }
}


export class OC_MergeActionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ON(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ON, 0);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public MATCH(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.MATCH, 0);
    }
    public oC_Set(): OC_SetContext | null {
        return this.getRuleContext(0, OC_SetContext);
    }
    public CREATE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CREATE, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_MergeAction;
    }
}


export class OC_CreateContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CREATE(): antlr.TerminalNode {
        return this.getToken(CypherParser.CREATE, 0)!;
    }
    public oC_Pattern(): OC_PatternContext {
        return this.getRuleContext(0, OC_PatternContext)!;
    }
    public SP(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SP, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Create;
    }
}


export class OC_SetContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SET(): antlr.TerminalNode {
        return this.getToken(CypherParser.SET, 0)!;
    }
    public oC_SetItem(): OC_SetItemContext[];
    public oC_SetItem(i: number): OC_SetItemContext | null;
    public oC_SetItem(i?: number): OC_SetItemContext[] | OC_SetItemContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_SetItemContext);
        }

        return this.getRuleContext(i, OC_SetItemContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Set;
    }
}


export class OC_SetItemContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_PropertyExpression(): OC_PropertyExpressionContext | null {
        return this.getRuleContext(0, OC_PropertyExpressionContext);
    }
    public oC_Expression(): OC_ExpressionContext | null {
        return this.getRuleContext(0, OC_ExpressionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_Variable(): OC_VariableContext | null {
        return this.getRuleContext(0, OC_VariableContext);
    }
    public oC_NodeLabels(): OC_NodeLabelsContext | null {
        return this.getRuleContext(0, OC_NodeLabelsContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_SetItem;
    }
}


export class OC_DeleteContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public DELETE(): antlr.TerminalNode {
        return this.getToken(CypherParser.DELETE, 0)!;
    }
    public oC_Expression(): OC_ExpressionContext[];
    public oC_Expression(i: number): OC_ExpressionContext | null;
    public oC_Expression(i?: number): OC_ExpressionContext[] | OC_ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ExpressionContext);
        }

        return this.getRuleContext(i, OC_ExpressionContext);
    }
    public DETACH(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DETACH, 0);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Delete;
    }
}


export class OC_RemoveContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public REMOVE(): antlr.TerminalNode {
        return this.getToken(CypherParser.REMOVE, 0)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_RemoveItem(): OC_RemoveItemContext[];
    public oC_RemoveItem(i: number): OC_RemoveItemContext | null;
    public oC_RemoveItem(i?: number): OC_RemoveItemContext[] | OC_RemoveItemContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_RemoveItemContext);
        }

        return this.getRuleContext(i, OC_RemoveItemContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Remove;
    }
}


export class OC_RemoveItemContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Variable(): OC_VariableContext | null {
        return this.getRuleContext(0, OC_VariableContext);
    }
    public oC_NodeLabels(): OC_NodeLabelsContext | null {
        return this.getRuleContext(0, OC_NodeLabelsContext);
    }
    public oC_PropertyExpression(): OC_PropertyExpressionContext | null {
        return this.getRuleContext(0, OC_PropertyExpressionContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_RemoveItem;
    }
}


export class OC_InQueryCallContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CALL(): antlr.TerminalNode {
        return this.getToken(CypherParser.CALL, 0)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_ExplicitProcedureInvocation(): OC_ExplicitProcedureInvocationContext {
        return this.getRuleContext(0, OC_ExplicitProcedureInvocationContext)!;
    }
    public YIELD(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.YIELD, 0);
    }
    public oC_YieldItems(): OC_YieldItemsContext | null {
        return this.getRuleContext(0, OC_YieldItemsContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_InQueryCall;
    }
}


export class OC_StandaloneCallContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CALL(): antlr.TerminalNode {
        return this.getToken(CypherParser.CALL, 0)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_ExplicitProcedureInvocation(): OC_ExplicitProcedureInvocationContext | null {
        return this.getRuleContext(0, OC_ExplicitProcedureInvocationContext);
    }
    public oC_ImplicitProcedureInvocation(): OC_ImplicitProcedureInvocationContext | null {
        return this.getRuleContext(0, OC_ImplicitProcedureInvocationContext);
    }
    public YIELD(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.YIELD, 0);
    }
    public oC_YieldItems(): OC_YieldItemsContext | null {
        return this.getRuleContext(0, OC_YieldItemsContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_StandaloneCall;
    }
}


export class OC_YieldItemsContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_YieldItem(): OC_YieldItemContext[];
    public oC_YieldItem(i: number): OC_YieldItemContext | null;
    public oC_YieldItem(i?: number): OC_YieldItemContext[] | OC_YieldItemContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_YieldItemContext);
        }

        return this.getRuleContext(i, OC_YieldItemContext);
    }
    public oC_Where(): OC_WhereContext | null {
        return this.getRuleContext(0, OC_WhereContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_YieldItems;
    }
}


export class OC_YieldItemContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Variable(): OC_VariableContext {
        return this.getRuleContext(0, OC_VariableContext)!;
    }
    public oC_ProcedureResultField(): OC_ProcedureResultFieldContext | null {
        return this.getRuleContext(0, OC_ProcedureResultFieldContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public AS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.AS, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_YieldItem;
    }
}


export class OC_WithContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public WITH(): antlr.TerminalNode {
        return this.getToken(CypherParser.WITH, 0)!;
    }
    public oC_ProjectionBody(): OC_ProjectionBodyContext {
        return this.getRuleContext(0, OC_ProjectionBodyContext)!;
    }
    public oC_Where(): OC_WhereContext | null {
        return this.getRuleContext(0, OC_WhereContext);
    }
    public SP(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SP, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_With;
    }
}


export class OC_ReturnContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public RETURN(): antlr.TerminalNode {
        return this.getToken(CypherParser.RETURN, 0)!;
    }
    public oC_ProjectionBody(): OC_ProjectionBodyContext {
        return this.getRuleContext(0, OC_ProjectionBodyContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Return;
    }
}


export class OC_ProjectionBodyContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_ProjectionItems(): OC_ProjectionItemsContext {
        return this.getRuleContext(0, OC_ProjectionItemsContext)!;
    }
    public DISTINCT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DISTINCT, 0);
    }
    public oC_Order(): OC_OrderContext | null {
        return this.getRuleContext(0, OC_OrderContext);
    }
    public oC_Skip(): OC_SkipContext | null {
        return this.getRuleContext(0, OC_SkipContext);
    }
    public oC_Limit(): OC_LimitContext | null {
        return this.getRuleContext(0, OC_LimitContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ProjectionBody;
    }
}


export class OC_ProjectionItemsContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_ProjectionItem(): OC_ProjectionItemContext[];
    public oC_ProjectionItem(i: number): OC_ProjectionItemContext | null;
    public oC_ProjectionItem(i?: number): OC_ProjectionItemContext[] | OC_ProjectionItemContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ProjectionItemContext);
        }

        return this.getRuleContext(i, OC_ProjectionItemContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ProjectionItems;
    }
}


export class OC_ProjectionItemContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Expression(): OC_ExpressionContext | null {
        return this.getRuleContext(0, OC_ExpressionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public AS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.AS, 0);
    }
    public oC_Variable(): OC_VariableContext | null {
        return this.getRuleContext(0, OC_VariableContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ProjectionItem;
    }
}


export class OC_OrderContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ORDER(): antlr.TerminalNode {
        return this.getToken(CypherParser.ORDER, 0)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public BY(): antlr.TerminalNode {
        return this.getToken(CypherParser.BY, 0)!;
    }
    public oC_SortItem(): OC_SortItemContext[];
    public oC_SortItem(i: number): OC_SortItemContext | null;
    public oC_SortItem(i?: number): OC_SortItemContext[] | OC_SortItemContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_SortItemContext);
        }

        return this.getRuleContext(i, OC_SortItemContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Order;
    }
}


export class OC_SkipContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public L_SKIP(): antlr.TerminalNode {
        return this.getToken(CypherParser.L_SKIP, 0)!;
    }
    public SP(): antlr.TerminalNode {
        return this.getToken(CypherParser.SP, 0)!;
    }
    public oC_Expression(): OC_ExpressionContext {
        return this.getRuleContext(0, OC_ExpressionContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Skip;
    }
}


export class OC_LimitContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public LIMIT(): antlr.TerminalNode {
        return this.getToken(CypherParser.LIMIT, 0)!;
    }
    public SP(): antlr.TerminalNode {
        return this.getToken(CypherParser.SP, 0)!;
    }
    public oC_Expression(): OC_ExpressionContext {
        return this.getRuleContext(0, OC_ExpressionContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Limit;
    }
}


export class OC_SortItemContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Expression(): OC_ExpressionContext {
        return this.getRuleContext(0, OC_ExpressionContext)!;
    }
    public ASCENDING(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ASCENDING, 0);
    }
    public ASC(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ASC, 0);
    }
    public DESCENDING(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DESCENDING, 0);
    }
    public DESC(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DESC, 0);
    }
    public SP(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SP, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_SortItem;
    }
}


export class OC_WhereContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public WHERE(): antlr.TerminalNode {
        return this.getToken(CypherParser.WHERE, 0)!;
    }
    public SP(): antlr.TerminalNode {
        return this.getToken(CypherParser.SP, 0)!;
    }
    public oC_Expression(): OC_ExpressionContext {
        return this.getRuleContext(0, OC_ExpressionContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Where;
    }
}


export class OC_PatternContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_PatternPart(): OC_PatternPartContext[];
    public oC_PatternPart(i: number): OC_PatternPartContext | null;
    public oC_PatternPart(i?: number): OC_PatternPartContext[] | OC_PatternPartContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_PatternPartContext);
        }

        return this.getRuleContext(i, OC_PatternPartContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Pattern;
    }
}


export class OC_PatternPartContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Variable(): OC_VariableContext | null {
        return this.getRuleContext(0, OC_VariableContext);
    }
    public oC_AnonymousPatternPart(): OC_AnonymousPatternPartContext | null {
        return this.getRuleContext(0, OC_AnonymousPatternPartContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_PatternPart;
    }
}


export class OC_AnonymousPatternPartContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_ShortestPathPattern(): OC_ShortestPathPatternContext | null {
        return this.getRuleContext(0, OC_ShortestPathPatternContext);
    }
    public oC_PatternElement(): OC_PatternElementContext | null {
        return this.getRuleContext(0, OC_PatternElementContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_AnonymousPatternPart;
    }
}


export class OC_ShortestPathPatternContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SHORTESTPATH(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SHORTESTPATH, 0);
    }
    public oC_PatternElement(): OC_PatternElementContext | null {
        return this.getRuleContext(0, OC_PatternElementContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public ALLSHORTESTPATHS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ALLSHORTESTPATHS, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ShortestPathPattern;
    }
}


export class OC_PatternElementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_NodePattern(): OC_NodePatternContext[];
    public oC_NodePattern(i: number): OC_NodePatternContext | null;
    public oC_NodePattern(i?: number): OC_NodePatternContext[] | OC_NodePatternContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_NodePatternContext);
        }

        return this.getRuleContext(i, OC_NodePatternContext);
    }
    public oC_QuantifiedPathPattern(): OC_QuantifiedPathPatternContext[];
    public oC_QuantifiedPathPattern(i: number): OC_QuantifiedPathPatternContext | null;
    public oC_QuantifiedPathPattern(i?: number): OC_QuantifiedPathPatternContext[] | OC_QuantifiedPathPatternContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_QuantifiedPathPatternContext);
        }

        return this.getRuleContext(i, OC_QuantifiedPathPatternContext);
    }
    public oC_PatternElementChain(): OC_PatternElementChainContext[];
    public oC_PatternElementChain(i: number): OC_PatternElementChainContext | null;
    public oC_PatternElementChain(i?: number): OC_PatternElementChainContext[] | OC_PatternElementChainContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_PatternElementChainContext);
        }

        return this.getRuleContext(i, OC_PatternElementChainContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_PatternElement(): OC_PatternElementContext | null {
        return this.getRuleContext(0, OC_PatternElementContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_PatternElement;
    }
}


export class OC_QuantifiedPathPatternContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_PatternElement(): OC_PatternElementContext {
        return this.getRuleContext(0, OC_PatternElementContext)!;
    }
    public oC_PathQuantifier(): OC_PathQuantifierContext {
        return this.getRuleContext(0, OC_PathQuantifierContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_Where(): OC_WhereContext | null {
        return this.getRuleContext(0, OC_WhereContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_QuantifiedPathPattern;
    }
}


export class OC_RelationshipsPatternContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_NodePattern(): OC_NodePatternContext {
        return this.getRuleContext(0, OC_NodePatternContext)!;
    }
    public oC_PatternElementChain(): OC_PatternElementChainContext[];
    public oC_PatternElementChain(i: number): OC_PatternElementChainContext | null;
    public oC_PatternElementChain(i?: number): OC_PatternElementChainContext[] | OC_PatternElementChainContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_PatternElementChainContext);
        }

        return this.getRuleContext(i, OC_PatternElementChainContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_RelationshipsPattern;
    }
}


export class OC_NodePatternContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_Variable(): OC_VariableContext | null {
        return this.getRuleContext(0, OC_VariableContext);
    }
    public oC_NodeLabels(): OC_NodeLabelsContext | null {
        return this.getRuleContext(0, OC_NodeLabelsContext);
    }
    public oC_Properties(): OC_PropertiesContext | null {
        return this.getRuleContext(0, OC_PropertiesContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_NodePattern;
    }
}


export class OC_PatternElementChainContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_RelationshipPattern(): OC_RelationshipPatternContext {
        return this.getRuleContext(0, OC_RelationshipPatternContext)!;
    }
    public oC_NodePattern(): OC_NodePatternContext {
        return this.getRuleContext(0, OC_NodePatternContext)!;
    }
    public oC_PathQuantifier(): OC_PathQuantifierContext | null {
        return this.getRuleContext(0, OC_PathQuantifierContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_PatternElementChain;
    }
}


export class OC_PathQuantifierContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_IntegerLiteral(): OC_IntegerLiteralContext[];
    public oC_IntegerLiteral(i: number): OC_IntegerLiteralContext | null;
    public oC_IntegerLiteral(i?: number): OC_IntegerLiteralContext[] | OC_IntegerLiteralContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_IntegerLiteralContext);
        }

        return this.getRuleContext(i, OC_IntegerLiteralContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_PathQuantifier;
    }
}


export class OC_RelationshipPatternContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_LeftArrowHead(): OC_LeftArrowHeadContext | null {
        return this.getRuleContext(0, OC_LeftArrowHeadContext);
    }
    public oC_Dash(): OC_DashContext[];
    public oC_Dash(i: number): OC_DashContext | null;
    public oC_Dash(i?: number): OC_DashContext[] | OC_DashContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_DashContext);
        }

        return this.getRuleContext(i, OC_DashContext);
    }
    public oC_RightArrowHead(): OC_RightArrowHeadContext | null {
        return this.getRuleContext(0, OC_RightArrowHeadContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_RelationshipDetail(): OC_RelationshipDetailContext | null {
        return this.getRuleContext(0, OC_RelationshipDetailContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_RelationshipPattern;
    }
}


export class OC_RelationshipDetailContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_Variable(): OC_VariableContext | null {
        return this.getRuleContext(0, OC_VariableContext);
    }
    public oC_RelationshipTypes(): OC_RelationshipTypesContext | null {
        return this.getRuleContext(0, OC_RelationshipTypesContext);
    }
    public oC_RangeLiteral(): OC_RangeLiteralContext | null {
        return this.getRuleContext(0, OC_RangeLiteralContext);
    }
    public oC_Properties(): OC_PropertiesContext | null {
        return this.getRuleContext(0, OC_PropertiesContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_RelationshipDetail;
    }
}


export class OC_PropertiesContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_MapLiteral(): OC_MapLiteralContext | null {
        return this.getRuleContext(0, OC_MapLiteralContext);
    }
    public oC_Parameter(): OC_ParameterContext | null {
        return this.getRuleContext(0, OC_ParameterContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Properties;
    }
}


export class OC_RelationshipTypesContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_RelTypeName(): OC_RelTypeNameContext[];
    public oC_RelTypeName(i: number): OC_RelTypeNameContext | null;
    public oC_RelTypeName(i?: number): OC_RelTypeNameContext[] | OC_RelTypeNameContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_RelTypeNameContext);
        }

        return this.getRuleContext(i, OC_RelTypeNameContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_RelationshipTypes;
    }
}


export class OC_NodeLabelsContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_NodeLabel(): OC_NodeLabelContext[];
    public oC_NodeLabel(i: number): OC_NodeLabelContext | null;
    public oC_NodeLabel(i?: number): OC_NodeLabelContext[] | OC_NodeLabelContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_NodeLabelContext);
        }

        return this.getRuleContext(i, OC_NodeLabelContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_NodeLabels;
    }
}


export class OC_NodeLabelContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_LabelName(): OC_LabelNameContext {
        return this.getRuleContext(0, OC_LabelNameContext)!;
    }
    public SP(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SP, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_NodeLabel;
    }
}


export class OC_RangeLiteralContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_IntegerLiteral(): OC_IntegerLiteralContext[];
    public oC_IntegerLiteral(i: number): OC_IntegerLiteralContext | null;
    public oC_IntegerLiteral(i?: number): OC_IntegerLiteralContext[] | OC_IntegerLiteralContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_IntegerLiteralContext);
        }

        return this.getRuleContext(i, OC_IntegerLiteralContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_RangeLiteral;
    }
}


export class OC_LabelNameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_SchemaName(): OC_SchemaNameContext {
        return this.getRuleContext(0, OC_SchemaNameContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_LabelName;
    }
}


export class OC_RelTypeNameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_SchemaName(): OC_SchemaNameContext {
        return this.getRuleContext(0, OC_SchemaNameContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_RelTypeName;
    }
}


export class OC_PropertyExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Atom(): OC_AtomContext {
        return this.getRuleContext(0, OC_AtomContext)!;
    }
    public oC_PropertyLookup(): OC_PropertyLookupContext[];
    public oC_PropertyLookup(i: number): OC_PropertyLookupContext | null;
    public oC_PropertyLookup(i?: number): OC_PropertyLookupContext[] | OC_PropertyLookupContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_PropertyLookupContext);
        }

        return this.getRuleContext(i, OC_PropertyLookupContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_PropertyExpression;
    }
}


export class OC_ExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_OrExpression(): OC_OrExpressionContext {
        return this.getRuleContext(0, OC_OrExpressionContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Expression;
    }
}


export class OC_OrExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_XorExpression(): OC_XorExpressionContext[];
    public oC_XorExpression(i: number): OC_XorExpressionContext | null;
    public oC_XorExpression(i?: number): OC_XorExpressionContext[] | OC_XorExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_XorExpressionContext);
        }

        return this.getRuleContext(i, OC_XorExpressionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public OR(): antlr.TerminalNode[];
    public OR(i: number): antlr.TerminalNode | null;
    public OR(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.OR);
    	} else {
    		return this.getToken(CypherParser.OR, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_OrExpression;
    }
}


export class OC_XorExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_AndExpression(): OC_AndExpressionContext[];
    public oC_AndExpression(i: number): OC_AndExpressionContext | null;
    public oC_AndExpression(i?: number): OC_AndExpressionContext[] | OC_AndExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_AndExpressionContext);
        }

        return this.getRuleContext(i, OC_AndExpressionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public XOR(): antlr.TerminalNode[];
    public XOR(i: number): antlr.TerminalNode | null;
    public XOR(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.XOR);
    	} else {
    		return this.getToken(CypherParser.XOR, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_XorExpression;
    }
}


export class OC_AndExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_NotExpression(): OC_NotExpressionContext[];
    public oC_NotExpression(i: number): OC_NotExpressionContext | null;
    public oC_NotExpression(i?: number): OC_NotExpressionContext[] | OC_NotExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_NotExpressionContext);
        }

        return this.getRuleContext(i, OC_NotExpressionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public AND(): antlr.TerminalNode[];
    public AND(i: number): antlr.TerminalNode | null;
    public AND(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.AND);
    	} else {
    		return this.getToken(CypherParser.AND, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_AndExpression;
    }
}


export class OC_NotExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_ComparisonExpression(): OC_ComparisonExpressionContext {
        return this.getRuleContext(0, OC_ComparisonExpressionContext)!;
    }
    public NOT(): antlr.TerminalNode[];
    public NOT(i: number): antlr.TerminalNode | null;
    public NOT(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.NOT);
    	} else {
    		return this.getToken(CypherParser.NOT, i);
    	}
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_NotExpression;
    }
}


export class OC_ComparisonExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_StringListNullPredicateExpression(): OC_StringListNullPredicateExpressionContext {
        return this.getRuleContext(0, OC_StringListNullPredicateExpressionContext)!;
    }
    public oC_PartialComparisonExpression(): OC_PartialComparisonExpressionContext[];
    public oC_PartialComparisonExpression(i: number): OC_PartialComparisonExpressionContext | null;
    public oC_PartialComparisonExpression(i?: number): OC_PartialComparisonExpressionContext[] | OC_PartialComparisonExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_PartialComparisonExpressionContext);
        }

        return this.getRuleContext(i, OC_PartialComparisonExpressionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ComparisonExpression;
    }
}


export class OC_PartialComparisonExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_StringListNullPredicateExpression(): OC_StringListNullPredicateExpressionContext | null {
        return this.getRuleContext(0, OC_StringListNullPredicateExpressionContext);
    }
    public SP(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SP, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_PartialComparisonExpression;
    }
}


export class OC_StringListNullPredicateExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_AddOrSubtractExpression(): OC_AddOrSubtractExpressionContext {
        return this.getRuleContext(0, OC_AddOrSubtractExpressionContext)!;
    }
    public oC_StringPredicateExpression(): OC_StringPredicateExpressionContext[];
    public oC_StringPredicateExpression(i: number): OC_StringPredicateExpressionContext | null;
    public oC_StringPredicateExpression(i?: number): OC_StringPredicateExpressionContext[] | OC_StringPredicateExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_StringPredicateExpressionContext);
        }

        return this.getRuleContext(i, OC_StringPredicateExpressionContext);
    }
    public oC_ListPredicateExpression(): OC_ListPredicateExpressionContext[];
    public oC_ListPredicateExpression(i: number): OC_ListPredicateExpressionContext | null;
    public oC_ListPredicateExpression(i?: number): OC_ListPredicateExpressionContext[] | OC_ListPredicateExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ListPredicateExpressionContext);
        }

        return this.getRuleContext(i, OC_ListPredicateExpressionContext);
    }
    public oC_NullPredicateExpression(): OC_NullPredicateExpressionContext[];
    public oC_NullPredicateExpression(i: number): OC_NullPredicateExpressionContext | null;
    public oC_NullPredicateExpression(i?: number): OC_NullPredicateExpressionContext[] | OC_NullPredicateExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_NullPredicateExpressionContext);
        }

        return this.getRuleContext(i, OC_NullPredicateExpressionContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_StringListNullPredicateExpression;
    }
}


export class OC_StringPredicateExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_AddOrSubtractExpression(): OC_AddOrSubtractExpressionContext {
        return this.getRuleContext(0, OC_AddOrSubtractExpressionContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public STARTS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.STARTS, 0);
    }
    public WITH(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.WITH, 0);
    }
    public ENDS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ENDS, 0);
    }
    public CONTAINS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CONTAINS, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_StringPredicateExpression;
    }
}


export class OC_ListPredicateExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public IN(): antlr.TerminalNode {
        return this.getToken(CypherParser.IN, 0)!;
    }
    public oC_AddOrSubtractExpression(): OC_AddOrSubtractExpressionContext {
        return this.getRuleContext(0, OC_AddOrSubtractExpressionContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ListPredicateExpression;
    }
}


export class OC_NullPredicateExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public IS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.IS, 0);
    }
    public NULL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.NULL, 0);
    }
    public NOT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.NOT, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_NullPredicateExpression;
    }
}


export class OC_AddOrSubtractExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_MultiplyDivideModuloExpression(): OC_MultiplyDivideModuloExpressionContext[];
    public oC_MultiplyDivideModuloExpression(i: number): OC_MultiplyDivideModuloExpressionContext | null;
    public oC_MultiplyDivideModuloExpression(i?: number): OC_MultiplyDivideModuloExpressionContext[] | OC_MultiplyDivideModuloExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_MultiplyDivideModuloExpressionContext);
        }

        return this.getRuleContext(i, OC_MultiplyDivideModuloExpressionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_AddOrSubtractExpression;
    }
}


export class OC_MultiplyDivideModuloExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_PowerOfExpression(): OC_PowerOfExpressionContext[];
    public oC_PowerOfExpression(i: number): OC_PowerOfExpressionContext | null;
    public oC_PowerOfExpression(i?: number): OC_PowerOfExpressionContext[] | OC_PowerOfExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_PowerOfExpressionContext);
        }

        return this.getRuleContext(i, OC_PowerOfExpressionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_MultiplyDivideModuloExpression;
    }
}


export class OC_PowerOfExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_UnaryAddOrSubtractExpression(): OC_UnaryAddOrSubtractExpressionContext[];
    public oC_UnaryAddOrSubtractExpression(i: number): OC_UnaryAddOrSubtractExpressionContext | null;
    public oC_UnaryAddOrSubtractExpression(i?: number): OC_UnaryAddOrSubtractExpressionContext[] | OC_UnaryAddOrSubtractExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_UnaryAddOrSubtractExpressionContext);
        }

        return this.getRuleContext(i, OC_UnaryAddOrSubtractExpressionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_PowerOfExpression;
    }
}


export class OC_UnaryAddOrSubtractExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_NonArithmeticOperatorExpression(): OC_NonArithmeticOperatorExpressionContext | null {
        return this.getRuleContext(0, OC_NonArithmeticOperatorExpressionContext);
    }
    public SP(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SP, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_UnaryAddOrSubtractExpression;
    }
}


export class OC_NonArithmeticOperatorExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Atom(): OC_AtomContext {
        return this.getRuleContext(0, OC_AtomContext)!;
    }
    public oC_NodeLabels(): OC_NodeLabelsContext | null {
        return this.getRuleContext(0, OC_NodeLabelsContext);
    }
    public oC_ListOperatorExpression(): OC_ListOperatorExpressionContext[];
    public oC_ListOperatorExpression(i: number): OC_ListOperatorExpressionContext | null;
    public oC_ListOperatorExpression(i?: number): OC_ListOperatorExpressionContext[] | OC_ListOperatorExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ListOperatorExpressionContext);
        }

        return this.getRuleContext(i, OC_ListOperatorExpressionContext);
    }
    public oC_PropertyLookup(): OC_PropertyLookupContext[];
    public oC_PropertyLookup(i: number): OC_PropertyLookupContext | null;
    public oC_PropertyLookup(i?: number): OC_PropertyLookupContext[] | OC_PropertyLookupContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_PropertyLookupContext);
        }

        return this.getRuleContext(i, OC_PropertyLookupContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_NonArithmeticOperatorExpression;
    }
}


export class OC_ListOperatorExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Expression(): OC_ExpressionContext[];
    public oC_Expression(i: number): OC_ExpressionContext | null;
    public oC_Expression(i?: number): OC_ExpressionContext[] | OC_ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ExpressionContext);
        }

        return this.getRuleContext(i, OC_ExpressionContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ListOperatorExpression;
    }
}


export class OC_PropertyLookupContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_PropertyKeyName(): OC_PropertyKeyNameContext | null {
        return this.getRuleContext(0, OC_PropertyKeyNameContext);
    }
    public SP(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SP, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_PropertyLookup;
    }
}


export class OC_AtomContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Literal(): OC_LiteralContext | null {
        return this.getRuleContext(0, OC_LiteralContext);
    }
    public oC_Parameter(): OC_ParameterContext | null {
        return this.getRuleContext(0, OC_ParameterContext);
    }
    public oC_CaseExpression(): OC_CaseExpressionContext | null {
        return this.getRuleContext(0, OC_CaseExpressionContext);
    }
    public oC_CountSubquery(): OC_CountSubqueryContext | null {
        return this.getRuleContext(0, OC_CountSubqueryContext);
    }
    public COUNT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.COUNT, 0);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_ListComprehension(): OC_ListComprehensionContext | null {
        return this.getRuleContext(0, OC_ListComprehensionContext);
    }
    public oC_PatternComprehension(): OC_PatternComprehensionContext | null {
        return this.getRuleContext(0, OC_PatternComprehensionContext);
    }
    public oC_Quantifier(): OC_QuantifierContext | null {
        return this.getRuleContext(0, OC_QuantifierContext);
    }
    public oC_Reduce(): OC_ReduceContext | null {
        return this.getRuleContext(0, OC_ReduceContext);
    }
    public oC_PatternPredicate(): OC_PatternPredicateContext | null {
        return this.getRuleContext(0, OC_PatternPredicateContext);
    }
    public oC_ParenthesizedExpression(): OC_ParenthesizedExpressionContext | null {
        return this.getRuleContext(0, OC_ParenthesizedExpressionContext);
    }
    public oC_FunctionInvocation(): OC_FunctionInvocationContext | null {
        return this.getRuleContext(0, OC_FunctionInvocationContext);
    }
    public oC_ExistentialSubquery(): OC_ExistentialSubqueryContext | null {
        return this.getRuleContext(0, OC_ExistentialSubqueryContext);
    }
    public oC_MapProjection(): OC_MapProjectionContext | null {
        return this.getRuleContext(0, OC_MapProjectionContext);
    }
    public oC_Variable(): OC_VariableContext | null {
        return this.getRuleContext(0, OC_VariableContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Atom;
    }
}


export class OC_ReduceContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public REDUCE(): antlr.TerminalNode {
        return this.getToken(CypherParser.REDUCE, 0)!;
    }
    public oC_Variable(): OC_VariableContext {
        return this.getRuleContext(0, OC_VariableContext)!;
    }
    public oC_Expression(): OC_ExpressionContext[];
    public oC_Expression(i: number): OC_ExpressionContext | null;
    public oC_Expression(i?: number): OC_ExpressionContext[] | OC_ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ExpressionContext);
        }

        return this.getRuleContext(i, OC_ExpressionContext);
    }
    public oC_IdInColl(): OC_IdInCollContext {
        return this.getRuleContext(0, OC_IdInCollContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Reduce;
    }
}


export class OC_MapProjectionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Variable(): OC_VariableContext {
        return this.getRuleContext(0, OC_VariableContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_MapProjectionElement(): OC_MapProjectionElementContext[];
    public oC_MapProjectionElement(i: number): OC_MapProjectionElementContext | null;
    public oC_MapProjectionElement(i?: number): OC_MapProjectionElementContext[] | OC_MapProjectionElementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_MapProjectionElementContext);
        }

        return this.getRuleContext(i, OC_MapProjectionElementContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_MapProjection;
    }
}


export class OC_MapProjectionElementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_PropertyKeyName(): OC_PropertyKeyNameContext | null {
        return this.getRuleContext(0, OC_PropertyKeyNameContext);
    }
    public oC_Expression(): OC_ExpressionContext | null {
        return this.getRuleContext(0, OC_ExpressionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_Variable(): OC_VariableContext | null {
        return this.getRuleContext(0, OC_VariableContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_MapProjectionElement;
    }
}


export class OC_CaseExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public END(): antlr.TerminalNode {
        return this.getToken(CypherParser.END, 0)!;
    }
    public ELSE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ELSE, 0);
    }
    public oC_Expression(): OC_ExpressionContext[];
    public oC_Expression(i: number): OC_ExpressionContext | null;
    public oC_Expression(i?: number): OC_ExpressionContext[] | OC_ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ExpressionContext);
        }

        return this.getRuleContext(i, OC_ExpressionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public CASE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CASE, 0);
    }
    public oC_CaseAlternative(): OC_CaseAlternativeContext[];
    public oC_CaseAlternative(i: number): OC_CaseAlternativeContext | null;
    public oC_CaseAlternative(i?: number): OC_CaseAlternativeContext[] | OC_CaseAlternativeContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_CaseAlternativeContext);
        }

        return this.getRuleContext(i, OC_CaseAlternativeContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_CaseExpression;
    }
}


export class OC_CaseAlternativeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public WHEN(): antlr.TerminalNode {
        return this.getToken(CypherParser.WHEN, 0)!;
    }
    public oC_Expression(): OC_ExpressionContext[];
    public oC_Expression(i: number): OC_ExpressionContext | null;
    public oC_Expression(i?: number): OC_ExpressionContext[] | OC_ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ExpressionContext);
        }

        return this.getRuleContext(i, OC_ExpressionContext);
    }
    public THEN(): antlr.TerminalNode {
        return this.getToken(CypherParser.THEN, 0)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_CaseAlternative;
    }
}


export class OC_ListComprehensionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_FilterExpression(): OC_FilterExpressionContext {
        return this.getRuleContext(0, OC_FilterExpressionContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_Expression(): OC_ExpressionContext | null {
        return this.getRuleContext(0, OC_ExpressionContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ListComprehension;
    }
}


export class OC_PatternComprehensionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_RelationshipsPattern(): OC_RelationshipsPatternContext {
        return this.getRuleContext(0, OC_RelationshipsPatternContext)!;
    }
    public oC_Expression(): OC_ExpressionContext {
        return this.getRuleContext(0, OC_ExpressionContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_Variable(): OC_VariableContext | null {
        return this.getRuleContext(0, OC_VariableContext);
    }
    public oC_Where(): OC_WhereContext | null {
        return this.getRuleContext(0, OC_WhereContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_PatternComprehension;
    }
}


export class OC_QuantifierContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ALL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ALL, 0);
    }
    public oC_FilterExpression(): OC_FilterExpressionContext | null {
        return this.getRuleContext(0, OC_FilterExpressionContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public ANY(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ANY, 0);
    }
    public NONE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.NONE, 0);
    }
    public SINGLE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SINGLE, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Quantifier;
    }
}


export class OC_FilterExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_IdInColl(): OC_IdInCollContext {
        return this.getRuleContext(0, OC_IdInCollContext)!;
    }
    public oC_Where(): OC_WhereContext | null {
        return this.getRuleContext(0, OC_WhereContext);
    }
    public SP(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SP, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_FilterExpression;
    }
}


export class OC_PatternPredicateContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_RelationshipsPattern(): OC_RelationshipsPatternContext {
        return this.getRuleContext(0, OC_RelationshipsPatternContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_PatternPredicate;
    }
}


export class OC_ParenthesizedExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Expression(): OC_ExpressionContext {
        return this.getRuleContext(0, OC_ExpressionContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ParenthesizedExpression;
    }
}


export class OC_IdInCollContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Variable(): OC_VariableContext {
        return this.getRuleContext(0, OC_VariableContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public IN(): antlr.TerminalNode {
        return this.getToken(CypherParser.IN, 0)!;
    }
    public oC_Expression(): OC_ExpressionContext {
        return this.getRuleContext(0, OC_ExpressionContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_IdInColl;
    }
}


export class OC_FunctionInvocationContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_FunctionName(): OC_FunctionNameContext {
        return this.getRuleContext(0, OC_FunctionNameContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public DISTINCT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DISTINCT, 0);
    }
    public oC_Expression(): OC_ExpressionContext[];
    public oC_Expression(i: number): OC_ExpressionContext | null;
    public oC_Expression(i?: number): OC_ExpressionContext[] | OC_ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ExpressionContext);
        }

        return this.getRuleContext(i, OC_ExpressionContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_FunctionInvocation;
    }
}


export class OC_FunctionNameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Namespace(): OC_NamespaceContext {
        return this.getRuleContext(0, OC_NamespaceContext)!;
    }
    public oC_SymbolicName(): OC_SymbolicNameContext {
        return this.getRuleContext(0, OC_SymbolicNameContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_FunctionName;
    }
}


export class OC_ExistentialSubqueryContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public EXISTS(): antlr.TerminalNode {
        return this.getToken(CypherParser.EXISTS, 0)!;
    }
    public oC_RegularQuery(): OC_RegularQueryContext | null {
        return this.getRuleContext(0, OC_RegularQueryContext);
    }
    public oC_SubqueryReadings(): OC_SubqueryReadingsContext | null {
        return this.getRuleContext(0, OC_SubqueryReadingsContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_Pattern(): OC_PatternContext | null {
        return this.getRuleContext(0, OC_PatternContext);
    }
    public oC_Where(): OC_WhereContext | null {
        return this.getRuleContext(0, OC_WhereContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ExistentialSubquery;
    }
}


export class OC_CountSubqueryContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public COUNT(): antlr.TerminalNode {
        return this.getToken(CypherParser.COUNT, 0)!;
    }
    public oC_RegularQuery(): OC_RegularQueryContext | null {
        return this.getRuleContext(0, OC_RegularQueryContext);
    }
    public oC_SubqueryReadings(): OC_SubqueryReadingsContext | null {
        return this.getRuleContext(0, OC_SubqueryReadingsContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_Pattern(): OC_PatternContext | null {
        return this.getRuleContext(0, OC_PatternContext);
    }
    public oC_Where(): OC_WhereContext | null {
        return this.getRuleContext(0, OC_WhereContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_CountSubquery;
    }
}


export class OC_SubqueryReadingsContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_ReadingClause(): OC_ReadingClauseContext[];
    public oC_ReadingClause(i: number): OC_ReadingClauseContext | null;
    public oC_ReadingClause(i?: number): OC_ReadingClauseContext[] | OC_ReadingClauseContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ReadingClauseContext);
        }

        return this.getRuleContext(i, OC_ReadingClauseContext);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_SubqueryReadings;
    }
}


export class OC_ExplicitProcedureInvocationContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_ProcedureName(): OC_ProcedureNameContext {
        return this.getRuleContext(0, OC_ProcedureNameContext)!;
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_Expression(): OC_ExpressionContext[];
    public oC_Expression(i: number): OC_ExpressionContext | null;
    public oC_Expression(i?: number): OC_ExpressionContext[] | OC_ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ExpressionContext);
        }

        return this.getRuleContext(i, OC_ExpressionContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ExplicitProcedureInvocation;
    }
}


export class OC_ImplicitProcedureInvocationContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_ProcedureName(): OC_ProcedureNameContext {
        return this.getRuleContext(0, OC_ProcedureNameContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ImplicitProcedureInvocation;
    }
}


export class OC_ProcedureResultFieldContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_SymbolicName(): OC_SymbolicNameContext {
        return this.getRuleContext(0, OC_SymbolicNameContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ProcedureResultField;
    }
}


export class OC_ProcedureNameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_Namespace(): OC_NamespaceContext {
        return this.getRuleContext(0, OC_NamespaceContext)!;
    }
    public oC_SymbolicName(): OC_SymbolicNameContext {
        return this.getRuleContext(0, OC_SymbolicNameContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ProcedureName;
    }
}


export class OC_NamespaceContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_SymbolicName(): OC_SymbolicNameContext[];
    public oC_SymbolicName(i: number): OC_SymbolicNameContext | null;
    public oC_SymbolicName(i?: number): OC_SymbolicNameContext[] | OC_SymbolicNameContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_SymbolicNameContext);
        }

        return this.getRuleContext(i, OC_SymbolicNameContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Namespace;
    }
}


export class OC_VariableContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_SymbolicName(): OC_SymbolicNameContext | null {
        return this.getRuleContext(0, OC_SymbolicNameContext);
    }
    public oC_KeywordVariable(): OC_KeywordVariableContext | null {
        return this.getRuleContext(0, OC_KeywordVariableContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Variable;
    }
}


export class OC_KeywordVariableContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ALL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ALL, 0);
    }
    public ASC(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ASC, 0);
    }
    public ASCENDING(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ASCENDING, 0);
    }
    public BY(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.BY, 0);
    }
    public CREATE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CREATE, 0);
    }
    public DELETE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DELETE, 0);
    }
    public DESC(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DESC, 0);
    }
    public DESCENDING(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DESCENDING, 0);
    }
    public DETACH(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DETACH, 0);
    }
    public EXISTS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.EXISTS, 0);
    }
    public LIMIT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.LIMIT, 0);
    }
    public MATCH(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.MATCH, 0);
    }
    public MERGE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.MERGE, 0);
    }
    public ON(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ON, 0);
    }
    public OPTIONAL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.OPTIONAL, 0);
    }
    public ORDER(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ORDER, 0);
    }
    public REMOVE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.REMOVE, 0);
    }
    public RETURN(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.RETURN, 0);
    }
    public SET(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SET, 0);
    }
    public L_SKIP(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.L_SKIP, 0);
    }
    public WHERE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.WHERE, 0);
    }
    public WITH(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.WITH, 0);
    }
    public UNION(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.UNION, 0);
    }
    public UNWIND(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.UNWIND, 0);
    }
    public AND(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.AND, 0);
    }
    public AS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.AS, 0);
    }
    public CONTAINS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CONTAINS, 0);
    }
    public DISTINCT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DISTINCT, 0);
    }
    public ENDS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ENDS, 0);
    }
    public IN(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.IN, 0);
    }
    public IS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.IS, 0);
    }
    public NOT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.NOT, 0);
    }
    public OR(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.OR, 0);
    }
    public STARTS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.STARTS, 0);
    }
    public XOR(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.XOR, 0);
    }
    public CONSTRAINT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CONSTRAINT, 0);
    }
    public DO(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DO, 0);
    }
    public FOR(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.FOR, 0);
    }
    public REQUIRE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.REQUIRE, 0);
    }
    public UNIQUE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.UNIQUE, 0);
    }
    public CASE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CASE, 0);
    }
    public WHEN(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.WHEN, 0);
    }
    public THEN(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.THEN, 0);
    }
    public ELSE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ELSE, 0);
    }
    public END(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.END, 0);
    }
    public MANDATORY(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.MANDATORY, 0);
    }
    public SCALAR(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SCALAR, 0);
    }
    public ADD(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ADD, 0);
    }
    public DROP(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DROP, 0);
    }
    public CALL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CALL, 0);
    }
    public YIELD(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.YIELD, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_KeywordVariable;
    }
}


export class OC_LiteralContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_BooleanLiteral(): OC_BooleanLiteralContext | null {
        return this.getRuleContext(0, OC_BooleanLiteralContext);
    }
    public NULL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.NULL, 0);
    }
    public oC_NumberLiteral(): OC_NumberLiteralContext | null {
        return this.getRuleContext(0, OC_NumberLiteralContext);
    }
    public StringLiteral(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.StringLiteral, 0);
    }
    public oC_ListLiteral(): OC_ListLiteralContext | null {
        return this.getRuleContext(0, OC_ListLiteralContext);
    }
    public oC_MapLiteral(): OC_MapLiteralContext | null {
        return this.getRuleContext(0, OC_MapLiteralContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Literal;
    }
}


export class OC_BooleanLiteralContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public TRUE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.TRUE, 0);
    }
    public FALSE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.FALSE, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_BooleanLiteral;
    }
}


export class OC_NumberLiteralContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_DoubleLiteral(): OC_DoubleLiteralContext | null {
        return this.getRuleContext(0, OC_DoubleLiteralContext);
    }
    public oC_IntegerLiteral(): OC_IntegerLiteralContext | null {
        return this.getRuleContext(0, OC_IntegerLiteralContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_NumberLiteral;
    }
}


export class OC_IntegerLiteralContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public HexInteger(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.HexInteger, 0);
    }
    public OctalInteger(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.OctalInteger, 0);
    }
    public DecimalInteger(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DecimalInteger, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_IntegerLiteral;
    }
}


export class OC_DoubleLiteralContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ExponentDecimalReal(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ExponentDecimalReal, 0);
    }
    public RegularDecimalReal(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.RegularDecimalReal, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_DoubleLiteral;
    }
}


export class OC_ListLiteralContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_Expression(): OC_ExpressionContext[];
    public oC_Expression(i: number): OC_ExpressionContext | null;
    public oC_Expression(i?: number): OC_ExpressionContext[] | OC_ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ExpressionContext);
        }

        return this.getRuleContext(i, OC_ExpressionContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ListLiteral;
    }
}


export class OC_MapLiteralContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SP(): antlr.TerminalNode[];
    public SP(i: number): antlr.TerminalNode | null;
    public SP(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CypherParser.SP);
    	} else {
    		return this.getToken(CypherParser.SP, i);
    	}
    }
    public oC_PropertyKeyName(): OC_PropertyKeyNameContext[];
    public oC_PropertyKeyName(i: number): OC_PropertyKeyNameContext | null;
    public oC_PropertyKeyName(i?: number): OC_PropertyKeyNameContext[] | OC_PropertyKeyNameContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_PropertyKeyNameContext);
        }

        return this.getRuleContext(i, OC_PropertyKeyNameContext);
    }
    public oC_Expression(): OC_ExpressionContext[];
    public oC_Expression(i: number): OC_ExpressionContext | null;
    public oC_Expression(i?: number): OC_ExpressionContext[] | OC_ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OC_ExpressionContext);
        }

        return this.getRuleContext(i, OC_ExpressionContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_MapLiteral;
    }
}


export class OC_PropertyKeyNameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_SchemaName(): OC_SchemaNameContext {
        return this.getRuleContext(0, OC_SchemaNameContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_PropertyKeyName;
    }
}


export class OC_ParameterContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_SchemaName(): OC_SchemaNameContext | null {
        return this.getRuleContext(0, OC_SchemaNameContext);
    }
    public CALL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CALL, 0);
    }
    public YIELD(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.YIELD, 0);
    }
    public DecimalInteger(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DecimalInteger, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Parameter;
    }
}


export class OC_SchemaNameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public oC_SymbolicName(): OC_SymbolicNameContext | null {
        return this.getRuleContext(0, OC_SymbolicNameContext);
    }
    public oC_ReservedWord(): OC_ReservedWordContext | null {
        return this.getRuleContext(0, OC_ReservedWordContext);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_SchemaName;
    }
}


export class OC_ReservedWordContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ALL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ALL, 0);
    }
    public ASC(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ASC, 0);
    }
    public ASCENDING(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ASCENDING, 0);
    }
    public BY(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.BY, 0);
    }
    public CREATE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CREATE, 0);
    }
    public DELETE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DELETE, 0);
    }
    public DESC(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DESC, 0);
    }
    public DESCENDING(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DESCENDING, 0);
    }
    public DETACH(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DETACH, 0);
    }
    public EXISTS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.EXISTS, 0);
    }
    public LIMIT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.LIMIT, 0);
    }
    public MATCH(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.MATCH, 0);
    }
    public MERGE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.MERGE, 0);
    }
    public ON(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ON, 0);
    }
    public OPTIONAL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.OPTIONAL, 0);
    }
    public ORDER(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ORDER, 0);
    }
    public REMOVE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.REMOVE, 0);
    }
    public RETURN(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.RETURN, 0);
    }
    public SET(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SET, 0);
    }
    public L_SKIP(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.L_SKIP, 0);
    }
    public WHERE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.WHERE, 0);
    }
    public WITH(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.WITH, 0);
    }
    public UNION(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.UNION, 0);
    }
    public UNWIND(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.UNWIND, 0);
    }
    public AND(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.AND, 0);
    }
    public AS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.AS, 0);
    }
    public CONTAINS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CONTAINS, 0);
    }
    public DISTINCT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DISTINCT, 0);
    }
    public ENDS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ENDS, 0);
    }
    public IN(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.IN, 0);
    }
    public IS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.IS, 0);
    }
    public NOT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.NOT, 0);
    }
    public OR(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.OR, 0);
    }
    public STARTS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.STARTS, 0);
    }
    public XOR(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.XOR, 0);
    }
    public FALSE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.FALSE, 0);
    }
    public TRUE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.TRUE, 0);
    }
    public NULL(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.NULL, 0);
    }
    public CONSTRAINT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CONSTRAINT, 0);
    }
    public DO(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DO, 0);
    }
    public FOR(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.FOR, 0);
    }
    public REQUIRE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.REQUIRE, 0);
    }
    public UNIQUE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.UNIQUE, 0);
    }
    public CASE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.CASE, 0);
    }
    public WHEN(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.WHEN, 0);
    }
    public THEN(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.THEN, 0);
    }
    public ELSE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ELSE, 0);
    }
    public END(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.END, 0);
    }
    public MANDATORY(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.MANDATORY, 0);
    }
    public SCALAR(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SCALAR, 0);
    }
    public OF(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.OF, 0);
    }
    public ADD(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ADD, 0);
    }
    public DROP(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.DROP, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_ReservedWord;
    }
}


export class OC_SymbolicNameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public UnescapedSymbolicName(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.UnescapedSymbolicName, 0);
    }
    public EscapedSymbolicName(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.EscapedSymbolicName, 0);
    }
    public HexLetter(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.HexLetter, 0);
    }
    public COUNT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.COUNT, 0);
    }
    public FILTER(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.FILTER, 0);
    }
    public EXTRACT(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.EXTRACT, 0);
    }
    public ANY(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ANY, 0);
    }
    public NONE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.NONE, 0);
    }
    public SINGLE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SINGLE, 0);
    }
    public REDUCE(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.REDUCE, 0);
    }
    public TRANSACTIONS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.TRANSACTIONS, 0);
    }
    public OF(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.OF, 0);
    }
    public ROWS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ROWS, 0);
    }
    public ROW(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ROW, 0);
    }
    public FOREACH(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.FOREACH, 0);
    }
    public SHORTESTPATH(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.SHORTESTPATH, 0);
    }
    public ALLSHORTESTPATHS(): antlr.TerminalNode | null {
        return this.getToken(CypherParser.ALLSHORTESTPATHS, 0);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_SymbolicName;
    }
}


export class OC_LeftArrowHeadContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_LeftArrowHead;
    }
}


export class OC_RightArrowHeadContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_RightArrowHead;
    }
}


export class OC_DashContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Dash;
    }
}
