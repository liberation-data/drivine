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
    public static readonly RULE_oC_Literal = 98;
    public static readonly RULE_oC_BooleanLiteral = 99;
    public static readonly RULE_oC_NumberLiteral = 100;
    public static readonly RULE_oC_IntegerLiteral = 101;
    public static readonly RULE_oC_DoubleLiteral = 102;
    public static readonly RULE_oC_ListLiteral = 103;
    public static readonly RULE_oC_MapLiteral = 104;
    public static readonly RULE_oC_PropertyKeyName = 105;
    public static readonly RULE_oC_Parameter = 106;
    public static readonly RULE_oC_SchemaName = 107;
    public static readonly RULE_oC_ReservedWord = 108;
    public static readonly RULE_oC_SymbolicName = 109;
    public static readonly RULE_oC_LeftArrowHead = 110;
    public static readonly RULE_oC_RightArrowHead = 111;
    public static readonly RULE_oC_Dash = 112;

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
        "oC_Namespace", "oC_Variable", "oC_Literal", "oC_BooleanLiteral", 
        "oC_NumberLiteral", "oC_IntegerLiteral", "oC_DoubleLiteral", "oC_ListLiteral", 
        "oC_MapLiteral", "oC_PropertyKeyName", "oC_Parameter", "oC_SchemaName", 
        "oC_ReservedWord", "oC_SymbolicName", "oC_LeftArrowHead", "oC_RightArrowHead", 
        "oC_Dash",
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
            this.state = 227;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 226;
                this.match(CypherParser.SP);
                }
            }

            this.state = 229;
            this.oC_Statement();
            this.state = 234;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 2, this.context) ) {
            case 1:
                {
                this.state = 231;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 230;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 233;
                this.match(CypherParser.T__0);
                }
                break;
            }
            this.state = 237;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 236;
                this.match(CypherParser.SP);
                }
            }

            this.state = 239;
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
            this.state = 241;
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
            this.state = 245;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 4, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 243;
                this.oC_RegularQuery();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 244;
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
            this.state = 247;
            this.oC_SingleQuery();
            this.state = 254;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 6, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 249;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 248;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 251;
                    this.oC_Union();
                    }
                    }
                }
                this.state = 256;
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
            this.state = 269;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 9, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 257;
                this.match(CypherParser.UNION);
                this.state = 258;
                this.match(CypherParser.SP);
                this.state = 259;
                this.match(CypherParser.ALL);
                this.state = 261;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 260;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 263;
                this.oC_SingleQuery();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 264;
                this.match(CypherParser.UNION);
                this.state = 266;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 265;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 268;
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
            this.state = 273;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 10, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 271;
                this.oC_SinglePartQuery();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 272;
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
            this.state = 310;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 19, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 281;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (((((_la - 53)) & ~0x1F) === 0 && ((1 << (_la - 53)) & 2055) !== 0)) {
                    {
                    {
                    this.state = 275;
                    this.oC_ReadingClause();
                    this.state = 277;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 276;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 283;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 284;
                this.oC_Return();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 291;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 14, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 285;
                        this.oC_ReadingClause();
                        this.state = 287;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 286;
                            this.match(CypherParser.SP);
                            }
                        }

                        }
                        }
                    }
                    this.state = 293;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 14, this.context);
                }
                this.state = 294;
                this.oC_UpdatingClause();
                this.state = 301;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 16, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 296;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 295;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 298;
                        this.oC_UpdatingClause();
                        }
                        }
                    }
                    this.state = 303;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 16, this.context);
                }
                this.state = 308;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 18, this.context) ) {
                case 1:
                    {
                    this.state = 305;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 304;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 307;
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
            this.state = 334;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
                    this.state = 318;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 21, this.context);
                    while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                        if (alternative === 1) {
                            {
                            {
                            this.state = 312;
                            this.oC_ReadingClause();
                            this.state = 314;
                            this.errorHandler.sync(this);
                            _la = this.tokenStream.LA(1);
                            if (_la === 133) {
                                {
                                this.state = 313;
                                this.match(CypherParser.SP);
                                }
                            }

                            }
                            }
                        }
                        this.state = 320;
                        this.errorHandler.sync(this);
                        alternative = this.interpreter.adaptivePredict(this.tokenStream, 21, this.context);
                    }
                    this.state = 327;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (((((_la - 49)) & ~0x1F) === 0 && ((1 << (_la - 49)) & 64785) !== 0)) {
                        {
                        {
                        this.state = 321;
                        this.oC_UpdatingClause();
                        this.state = 323;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 322;
                            this.match(CypherParser.SP);
                            }
                        }

                        }
                        }
                        this.state = 329;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 330;
                    this.oC_With();
                    this.state = 332;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 331;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 336;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 25, this.context);
            } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
            this.state = 338;
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
            this.state = 347;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.CREATE:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 340;
                this.oC_Create();
                }
                break;
            case CypherParser.MERGE:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 341;
                this.oC_Merge();
                }
                break;
            case CypherParser.DETACH:
            case CypherParser.DELETE:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 342;
                this.oC_Delete();
                }
                break;
            case CypherParser.SET:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 343;
                this.oC_Set();
                }
                break;
            case CypherParser.REMOVE:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 344;
                this.oC_Remove();
                }
                break;
            case CypherParser.FOREACH:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 345;
                this.oC_Foreach();
                }
                break;
            case CypherParser.OPTIONAL:
            case CypherParser.CALL:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 346;
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
            this.state = 349;
            this.match(CypherParser.FOREACH);
            this.state = 351;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 350;
                this.match(CypherParser.SP);
                }
            }

            this.state = 353;
            this.match(CypherParser.T__1);
            this.state = 355;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 354;
                this.match(CypherParser.SP);
                }
            }

            this.state = 357;
            this.oC_Variable();
            this.state = 358;
            this.match(CypherParser.SP);
            this.state = 359;
            this.match(CypherParser.IN);
            this.state = 360;
            this.match(CypherParser.SP);
            this.state = 361;
            this.oC_Expression();
            this.state = 363;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 362;
                this.match(CypherParser.SP);
                }
            }

            this.state = 365;
            this.match(CypherParser.T__2);
            this.state = 370;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
                    this.state = 367;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 366;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 369;
                    this.oC_UpdatingClause();
                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 372;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 31, this.context);
            } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
            this.state = 375;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 374;
                this.match(CypherParser.SP);
                }
            }

            this.state = 377;
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
            this.state = 383;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 33, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 379;
                this.oC_Match();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 380;
                this.oC_Unwind();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 381;
                this.oC_SubqueryCall();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 382;
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
            this.state = 387;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 53) {
                {
                this.state = 385;
                this.match(CypherParser.OPTIONAL);
                this.state = 386;
                this.match(CypherParser.SP);
                }
            }

            this.state = 389;
            this.match(CypherParser.CALL);
            this.state = 391;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 390;
                this.match(CypherParser.SP);
                }
            }

            this.state = 421;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 2) {
                {
                this.state = 393;
                this.match(CypherParser.T__1);
                this.state = 395;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 36, this.context) ) {
                case 1:
                    {
                    this.state = 394;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 412;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case CypherParser.T__4:
                    {
                    this.state = 397;
                    this.match(CypherParser.T__4);
                    }
                    break;
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
                    {
                    {
                    this.state = 398;
                    this.oC_Variable();
                    this.state = 409;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 39, this.context);
                    while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                        if (alternative === 1) {
                            {
                            {
                            this.state = 400;
                            this.errorHandler.sync(this);
                            _la = this.tokenStream.LA(1);
                            if (_la === 133) {
                                {
                                this.state = 399;
                                this.match(CypherParser.SP);
                                }
                            }

                            this.state = 402;
                            this.match(CypherParser.T__5);
                            this.state = 404;
                            this.errorHandler.sync(this);
                            _la = this.tokenStream.LA(1);
                            if (_la === 133) {
                                {
                                this.state = 403;
                                this.match(CypherParser.SP);
                                }
                            }

                            this.state = 406;
                            this.oC_Variable();
                            }
                            }
                        }
                        this.state = 411;
                        this.errorHandler.sync(this);
                        alternative = this.interpreter.adaptivePredict(this.tokenStream, 39, this.context);
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
                this.state = 415;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 414;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 417;
                this.match(CypherParser.T__3);
                this.state = 419;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 418;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 423;
            this.match(CypherParser.T__6);
            this.state = 425;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 424;
                this.match(CypherParser.SP);
                }
            }

            this.state = 427;
            this.oC_RegularQuery();
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
            this.match(CypherParser.T__7);
            this.state = 445;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 47, this.context) ) {
            case 1:
                {
                this.state = 432;
                this.match(CypherParser.SP);
                this.state = 433;
                this.match(CypherParser.IN);
                this.state = 434;
                this.match(CypherParser.SP);
                this.state = 435;
                this.match(CypherParser.TRANSACTIONS);
                this.state = 443;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 46, this.context) ) {
                case 1:
                    {
                    this.state = 436;
                    this.match(CypherParser.SP);
                    this.state = 437;
                    this.match(CypherParser.OF);
                    this.state = 438;
                    this.match(CypherParser.SP);
                    this.state = 439;
                    this.oC_Expression();
                    this.state = 440;
                    this.match(CypherParser.SP);
                    this.state = 441;
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
            this.state = 449;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 53) {
                {
                this.state = 447;
                this.match(CypherParser.OPTIONAL);
                this.state = 448;
                this.match(CypherParser.SP);
                }
            }

            this.state = 451;
            this.match(CypherParser.MATCH);
            this.state = 453;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 452;
                this.match(CypherParser.SP);
                }
            }

            this.state = 455;
            this.oC_Pattern();
            this.state = 460;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 51, this.context) ) {
            case 1:
                {
                this.state = 457;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 456;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 459;
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
            this.state = 462;
            this.match(CypherParser.UNWIND);
            this.state = 464;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 463;
                this.match(CypherParser.SP);
                }
            }

            this.state = 466;
            this.oC_Expression();
            this.state = 467;
            this.match(CypherParser.SP);
            this.state = 468;
            this.match(CypherParser.AS);
            this.state = 469;
            this.match(CypherParser.SP);
            this.state = 470;
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
            this.state = 472;
            this.match(CypherParser.MERGE);
            this.state = 474;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 473;
                this.match(CypherParser.SP);
                }
            }

            this.state = 476;
            this.oC_PatternPart();
            this.state = 481;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 54, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 477;
                    this.match(CypherParser.SP);
                    this.state = 478;
                    this.oC_MergeAction();
                    }
                    }
                }
                this.state = 483;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 54, this.context);
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
            this.state = 494;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 55, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 484;
                this.match(CypherParser.ON);
                this.state = 485;
                this.match(CypherParser.SP);
                this.state = 486;
                this.match(CypherParser.MATCH);
                this.state = 487;
                this.match(CypherParser.SP);
                this.state = 488;
                this.oC_Set();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 489;
                this.match(CypherParser.ON);
                this.state = 490;
                this.match(CypherParser.SP);
                this.state = 491;
                this.match(CypherParser.CREATE);
                this.state = 492;
                this.match(CypherParser.SP);
                this.state = 493;
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
            this.state = 496;
            this.match(CypherParser.CREATE);
            this.state = 498;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 497;
                this.match(CypherParser.SP);
                }
            }

            this.state = 500;
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
            this.state = 502;
            this.match(CypherParser.SET);
            this.state = 504;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 503;
                this.match(CypherParser.SP);
                }
            }

            this.state = 506;
            this.oC_SetItem();
            this.state = 517;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 60, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 508;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 507;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 510;
                    this.match(CypherParser.T__5);
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
                    this.oC_SetItem();
                    }
                    }
                }
                this.state = 519;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 60, this.context);
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
            this.state = 556;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 68, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 520;
                this.oC_PropertyExpression();
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
                this.match(CypherParser.T__8);
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
                this.oC_Expression();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 530;
                this.oC_Variable();
                this.state = 532;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 531;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 534;
                this.match(CypherParser.T__8);
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
                this.oC_Expression();
                }
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 540;
                this.oC_Variable();
                this.state = 542;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 541;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 544;
                this.match(CypherParser.T__9);
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
                this.oC_Expression();
                }
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                {
                this.state = 550;
                this.oC_Variable();
                this.state = 552;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 551;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 554;
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
            this.state = 560;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 61) {
                {
                this.state = 558;
                this.match(CypherParser.DETACH);
                this.state = 559;
                this.match(CypherParser.SP);
                }
            }

            this.state = 562;
            this.match(CypherParser.DELETE);
            this.state = 564;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 563;
                this.match(CypherParser.SP);
                }
            }

            this.state = 566;
            this.oC_Expression();
            this.state = 577;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 73, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 568;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 567;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 570;
                    this.match(CypherParser.T__5);
                    this.state = 572;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 571;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 574;
                    this.oC_Expression();
                    }
                    }
                }
                this.state = 579;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 73, this.context);
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
            this.state = 580;
            this.match(CypherParser.REMOVE);
            this.state = 581;
            this.match(CypherParser.SP);
            this.state = 582;
            this.oC_RemoveItem();
            this.state = 593;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 76, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 584;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 583;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 586;
                    this.match(CypherParser.T__5);
                    this.state = 588;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 587;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 590;
                    this.oC_RemoveItem();
                    }
                    }
                }
                this.state = 595;
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
    public oC_RemoveItem(): OC_RemoveItemContext {
        let localContext = new OC_RemoveItemContext(this.context, this.state);
        this.enterRule(localContext, 42, CypherParser.RULE_oC_RemoveItem);
        try {
            this.state = 600;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 77, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 596;
                this.oC_Variable();
                this.state = 597;
                this.oC_NodeLabels();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 599;
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
            this.state = 602;
            this.match(CypherParser.CALL);
            this.state = 603;
            this.match(CypherParser.SP);
            this.state = 604;
            this.oC_ExplicitProcedureInvocation();
            this.state = 611;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 79, this.context) ) {
            case 1:
                {
                this.state = 606;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 605;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 608;
                this.match(CypherParser.YIELD);
                this.state = 609;
                this.match(CypherParser.SP);
                this.state = 610;
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
            this.state = 613;
            this.match(CypherParser.CALL);
            this.state = 614;
            this.match(CypherParser.SP);
            this.state = 617;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 80, this.context) ) {
            case 1:
                {
                this.state = 615;
                this.oC_ExplicitProcedureInvocation();
                }
                break;
            case 2:
                {
                this.state = 616;
                this.oC_ImplicitProcedureInvocation();
                }
                break;
            }
            this.state = 628;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 83, this.context) ) {
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
                this.state = 626;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case CypherParser.T__4:
                    {
                    this.state = 624;
                    this.match(CypherParser.T__4);
                    }
                    break;
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
                    {
                    this.state = 625;
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
            this.state = 630;
            this.oC_YieldItem();
            this.state = 641;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 86, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 632;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 631;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 634;
                    this.match(CypherParser.T__5);
                    this.state = 636;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 635;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 638;
                    this.oC_YieldItem();
                    }
                    }
                }
                this.state = 643;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 86, this.context);
            }
            this.state = 648;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 88, this.context) ) {
            case 1:
                {
                this.state = 645;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 644;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 647;
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
            this.state = 655;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 89, this.context) ) {
            case 1:
                {
                this.state = 650;
                this.oC_ProcedureResultField();
                this.state = 651;
                this.match(CypherParser.SP);
                this.state = 652;
                this.match(CypherParser.AS);
                this.state = 653;
                this.match(CypherParser.SP);
                }
                break;
            }
            this.state = 657;
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
            this.state = 659;
            this.match(CypherParser.WITH);
            this.state = 660;
            this.oC_ProjectionBody();
            this.state = 665;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 91, this.context) ) {
            case 1:
                {
                this.state = 662;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 661;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 664;
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
            this.state = 667;
            this.match(CypherParser.RETURN);
            this.state = 668;
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
            this.state = 674;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 93, this.context) ) {
            case 1:
                {
                this.state = 671;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 670;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 673;
                this.match(CypherParser.DISTINCT);
                }
                break;
            }
            this.state = 676;
            this.match(CypherParser.SP);
            this.state = 677;
            this.oC_ProjectionItems();
            this.state = 680;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 94, this.context) ) {
            case 1:
                {
                this.state = 678;
                this.match(CypherParser.SP);
                this.state = 679;
                this.oC_Order();
                }
                break;
            }
            this.state = 684;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 95, this.context) ) {
            case 1:
                {
                this.state = 682;
                this.match(CypherParser.SP);
                this.state = 683;
                this.oC_Skip();
                }
                break;
            }
            this.state = 688;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 96, this.context) ) {
            case 1:
                {
                this.state = 686;
                this.match(CypherParser.SP);
                this.state = 687;
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
            this.state = 718;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__4:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 690;
                this.match(CypherParser.T__4);
                this.state = 701;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 99, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 692;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 691;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 694;
                        this.match(CypherParser.T__5);
                        this.state = 696;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 695;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 698;
                        this.oC_ProjectionItem();
                        }
                        }
                    }
                    this.state = 703;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 99, this.context);
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
            case CypherParser.ALL:
            case CypherParser.FOREACH:
            case CypherParser.TRANSACTIONS:
            case CypherParser.ROWS:
            case CypherParser.ROW:
            case CypherParser.SHORTESTPATH:
            case CypherParser.ALLSHORTESTPATHS:
            case CypherParser.NOT:
            case CypherParser.NULL:
            case CypherParser.REDUCE:
            case CypherParser.COUNT:
            case CypherParser.CASE:
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
            case CypherParser.OF:
            case CypherParser.FILTER:
            case CypherParser.EXTRACT:
            case CypherParser.UnescapedSymbolicName:
            case CypherParser.EscapedSymbolicName:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 704;
                this.oC_ProjectionItem();
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
            this.state = 727;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 104, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 720;
                this.oC_Expression();
                this.state = 721;
                this.match(CypherParser.SP);
                this.state = 722;
                this.match(CypherParser.AS);
                this.state = 723;
                this.match(CypherParser.SP);
                this.state = 724;
                this.oC_Variable();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 726;
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
            this.state = 729;
            this.match(CypherParser.ORDER);
            this.state = 730;
            this.match(CypherParser.SP);
            this.state = 731;
            this.match(CypherParser.BY);
            this.state = 732;
            this.match(CypherParser.SP);
            this.state = 733;
            this.oC_SortItem();
            this.state = 741;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 6) {
                {
                {
                this.state = 734;
                this.match(CypherParser.T__5);
                this.state = 736;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 735;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 738;
                this.oC_SortItem();
                }
                }
                this.state = 743;
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
            this.state = 744;
            this.match(CypherParser.L_SKIP);
            this.state = 745;
            this.match(CypherParser.SP);
            this.state = 746;
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
            this.state = 748;
            this.match(CypherParser.LIMIT);
            this.state = 749;
            this.match(CypherParser.SP);
            this.state = 750;
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
            this.state = 752;
            this.oC_Expression();
            this.state = 757;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 108, this.context) ) {
            case 1:
                {
                this.state = 754;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 753;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 756;
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
            this.state = 759;
            this.match(CypherParser.WHERE);
            this.state = 760;
            this.match(CypherParser.SP);
            this.state = 761;
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
            this.state = 763;
            this.oC_PatternPart();
            this.state = 774;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 111, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 765;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 764;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 767;
                    this.match(CypherParser.T__5);
                    this.state = 769;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 768;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 771;
                    this.oC_PatternPart();
                    }
                    }
                }
                this.state = 776;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 111, this.context);
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
            this.state = 788;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 114, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 777;
                this.oC_Variable();
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
                this.match(CypherParser.T__8);
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
                this.oC_AnonymousPatternPart();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 787;
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
            this.state = 792;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.SHORTESTPATH:
            case CypherParser.ALLSHORTESTPATHS:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 790;
                this.oC_ShortestPathPattern();
                }
                break;
            case CypherParser.T__1:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 791;
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
            this.state = 822;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.SHORTESTPATH:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 794;
                this.match(CypherParser.SHORTESTPATH);
                this.state = 796;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 795;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 798;
                this.match(CypherParser.T__1);
                this.state = 800;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 799;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 802;
                this.oC_PatternElement();
                this.state = 804;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 803;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 806;
                this.match(CypherParser.T__3);
                }
                }
                break;
            case CypherParser.ALLSHORTESTPATHS:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 808;
                this.match(CypherParser.ALLSHORTESTPATHS);
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
            this.state = 845;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 127, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 826;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 123, this.context) ) {
                case 1:
                    {
                    this.state = 824;
                    this.oC_NodePattern();
                    }
                    break;
                case 2:
                    {
                    this.state = 825;
                    this.oC_QuantifiedPathPattern();
                    }
                    break;
                }
                this.state = 838;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 126, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 829;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 828;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 834;
                        this.errorHandler.sync(this);
                        switch (this.interpreter.adaptivePredict(this.tokenStream, 125, this.context) ) {
                        case 1:
                            {
                            this.state = 831;
                            this.oC_PatternElementChain();
                            }
                            break;
                        case 2:
                            {
                            this.state = 832;
                            this.oC_QuantifiedPathPattern();
                            }
                            break;
                        case 3:
                            {
                            this.state = 833;
                            this.oC_NodePattern();
                            }
                            break;
                        }
                        }
                        }
                    }
                    this.state = 840;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 126, this.context);
                }
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 841;
                this.match(CypherParser.T__1);
                this.state = 842;
                this.oC_PatternElement();
                this.state = 843;
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
            this.state = 847;
            this.match(CypherParser.T__1);
            this.state = 849;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 848;
                this.match(CypherParser.SP);
                }
            }

            this.state = 851;
            this.oC_PatternElement();
            this.state = 856;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 130, this.context) ) {
            case 1:
                {
                this.state = 853;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 852;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 855;
                this.oC_Where();
                }
                break;
            }
            this.state = 859;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 858;
                this.match(CypherParser.SP);
                }
            }

            this.state = 861;
            this.match(CypherParser.T__3);
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
            this.state = 867;
            this.oC_NodePattern();
            this.state = 872;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
                    this.state = 869;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 868;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 871;
                    this.oC_PatternElementChain();
                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 874;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 134, this.context);
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
            this.state = 876;
            this.match(CypherParser.T__1);
            this.state = 878;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 877;
                this.match(CypherParser.SP);
                }
            }

            this.state = 884;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 49)) & ~0x1F) === 0 && ((1 << (_la - 49)) & 1610612751) !== 0) || ((((_la - 90)) & ~0x1F) === 0 && ((1 << (_la - 90)) & 66435) !== 0) || ((((_la - 124)) & ~0x1F) === 0 && ((1 << (_la - 124)) & 313) !== 0)) {
                {
                this.state = 880;
                this.oC_Variable();
                this.state = 882;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 881;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 890;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 14) {
                {
                this.state = 886;
                this.oC_NodeLabels();
                this.state = 888;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 887;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 896;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 7 || _la === 27) {
                {
                this.state = 892;
                this.oC_Properties();
                this.state = 894;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 893;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 898;
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
            this.state = 900;
            this.oC_RelationshipPattern();
            this.state = 905;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 143, this.context) ) {
            case 1:
                {
                this.state = 902;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 901;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 904;
                this.oC_PathQuantifier();
                }
                break;
            }
            this.state = 908;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 907;
                this.match(CypherParser.SP);
                }
            }

            this.state = 910;
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
            this.state = 937;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__10:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 912;
                this.match(CypherParser.T__10);
                }
                break;
            case CypherParser.T__4:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 913;
                this.match(CypherParser.T__4);
                }
                break;
            case CypherParser.T__6:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 914;
                this.match(CypherParser.T__6);
                this.state = 916;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 145, this.context) ) {
                case 1:
                    {
                    this.state = 915;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 919;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0)) {
                    {
                    this.state = 918;
                    this.oC_IntegerLiteral();
                    }
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

                this.state = 934;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 6) {
                    {
                    this.state = 924;
                    this.match(CypherParser.T__5);
                    this.state = 926;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 148, this.context) ) {
                    case 1:
                        {
                        this.state = 925;
                        this.match(CypherParser.SP);
                        }
                        break;
                    }
                    this.state = 929;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0)) {
                        {
                        this.state = 928;
                        this.oC_IntegerLiteral();
                        }
                    }

                    this.state = 932;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 931;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                }

                this.state = 936;
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
            this.state = 1003;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 169, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 939;
                this.oC_LeftArrowHead();
                this.state = 941;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 940;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 943;
                this.oC_Dash();
                this.state = 945;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 154, this.context) ) {
                case 1:
                    {
                    this.state = 944;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 948;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 947;
                    this.oC_RelationshipDetail();
                    }
                }

                this.state = 951;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 950;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 953;
                this.oC_Dash();
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
                this.oC_RightArrowHead();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 959;
                this.oC_LeftArrowHead();
                this.state = 961;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 960;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 963;
                this.oC_Dash();
                this.state = 965;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 159, this.context) ) {
                case 1:
                    {
                    this.state = 964;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 968;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 967;
                    this.oC_RelationshipDetail();
                    }
                }

                this.state = 971;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 970;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 973;
                this.oC_Dash();
                }
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 975;
                this.oC_Dash();
                this.state = 977;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 162, this.context) ) {
                case 1:
                    {
                    this.state = 976;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 980;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 979;
                    this.oC_RelationshipDetail();
                    }
                }

                this.state = 983;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 982;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 985;
                this.oC_Dash();
                this.state = 987;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 986;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 989;
                this.oC_RightArrowHead();
                }
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                {
                this.state = 991;
                this.oC_Dash();
                this.state = 993;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 166, this.context) ) {
                case 1:
                    {
                    this.state = 992;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 996;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 995;
                    this.oC_RelationshipDetail();
                    }
                }

                this.state = 999;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 998;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1001;
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
            this.state = 1005;
            this.match(CypherParser.T__11);
            this.state = 1007;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1006;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1013;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 49)) & ~0x1F) === 0 && ((1 << (_la - 49)) & 1610612751) !== 0) || ((((_la - 90)) & ~0x1F) === 0 && ((1 << (_la - 90)) & 66435) !== 0) || ((((_la - 124)) & ~0x1F) === 0 && ((1 << (_la - 124)) & 313) !== 0)) {
                {
                this.state = 1009;
                this.oC_Variable();
                this.state = 1011;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1010;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1019;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 14) {
                {
                this.state = 1015;
                this.oC_RelationshipTypes();
                this.state = 1017;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1016;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1022;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 5) {
                {
                this.state = 1021;
                this.oC_RangeLiteral();
                }
            }

            this.state = 1028;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 7 || _la === 27) {
                {
                this.state = 1024;
                this.oC_Properties();
                this.state = 1026;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1025;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1030;
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
            this.state = 1034;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__6:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1032;
                this.oC_MapLiteral();
                }
                break;
            case CypherParser.T__26:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1033;
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
            this.state = 1036;
            this.match(CypherParser.T__13);
            this.state = 1038;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1037;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1040;
            this.oC_RelTypeName();
            this.state = 1054;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 183, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1042;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1041;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1044;
                    this.match(CypherParser.T__2);
                    this.state = 1046;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 14) {
                        {
                        this.state = 1045;
                        this.match(CypherParser.T__13);
                        }
                    }

                    this.state = 1049;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1048;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1051;
                    this.oC_RelTypeName();
                    }
                    }
                }
                this.state = 1056;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 183, this.context);
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
            this.state = 1057;
            this.oC_NodeLabel();
            this.state = 1064;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 185, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1059;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1058;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1061;
                    this.oC_NodeLabel();
                    }
                    }
                }
                this.state = 1066;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 185, this.context);
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
            this.state = 1067;
            this.match(CypherParser.T__13);
            this.state = 1069;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1068;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1071;
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
            this.state = 1073;
            this.match(CypherParser.T__4);
            this.state = 1075;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1074;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1081;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0)) {
                {
                this.state = 1077;
                this.oC_IntegerLiteral();
                this.state = 1079;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1078;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1093;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 15) {
                {
                this.state = 1083;
                this.match(CypherParser.T__14);
                this.state = 1085;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1084;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1091;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0)) {
                    {
                    this.state = 1087;
                    this.oC_IntegerLiteral();
                    this.state = 1089;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1088;
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
            this.state = 1095;
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
            this.state = 1097;
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
            this.state = 1099;
            this.oC_Atom();
            this.state = 1104;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
                    this.state = 1101;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1100;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1103;
                    this.oC_PropertyLookup();
                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 1106;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 195, this.context);
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
            this.state = 1108;
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
            this.state = 1110;
            this.oC_XorExpression();
            this.state = 1117;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 196, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1111;
                    this.match(CypherParser.SP);
                    this.state = 1112;
                    this.match(CypherParser.OR);
                    this.state = 1113;
                    this.match(CypherParser.SP);
                    this.state = 1114;
                    this.oC_XorExpression();
                    }
                    }
                }
                this.state = 1119;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 196, this.context);
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
            this.state = 1120;
            this.oC_AndExpression();
            this.state = 1127;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 197, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1121;
                    this.match(CypherParser.SP);
                    this.state = 1122;
                    this.match(CypherParser.XOR);
                    this.state = 1123;
                    this.match(CypherParser.SP);
                    this.state = 1124;
                    this.oC_AndExpression();
                    }
                    }
                }
                this.state = 1129;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 197, this.context);
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
            this.state = 1130;
            this.oC_NotExpression();
            this.state = 1137;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 198, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1131;
                    this.match(CypherParser.SP);
                    this.state = 1132;
                    this.match(CypherParser.AND);
                    this.state = 1133;
                    this.match(CypherParser.SP);
                    this.state = 1134;
                    this.oC_NotExpression();
                    }
                    }
                }
                this.state = 1139;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 198, this.context);
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
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1146;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 83) {
                {
                {
                this.state = 1140;
                this.match(CypherParser.NOT);
                this.state = 1142;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1141;
                    this.match(CypherParser.SP);
                    }
                }

                }
                }
                this.state = 1148;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1149;
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
            this.state = 1151;
            this.oC_StringListNullPredicateExpression();
            this.state = 1158;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 202, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1153;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1152;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1155;
                    this.oC_PartialComparisonExpression();
                    }
                    }
                }
                this.state = 1160;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 202, this.context);
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
            this.state = 1191;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__8:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1161;
                this.match(CypherParser.T__8);
                this.state = 1163;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1162;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1165;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__15:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1166;
                this.match(CypherParser.T__15);
                this.state = 1168;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1167;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1170;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__16:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 1171;
                this.match(CypherParser.T__16);
                this.state = 1173;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1172;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1175;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__17:
                this.enterOuterAlt(localContext, 4);
                {
                {
                this.state = 1176;
                this.match(CypherParser.T__17);
                this.state = 1178;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1177;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1180;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__18:
                this.enterOuterAlt(localContext, 5);
                {
                {
                this.state = 1181;
                this.match(CypherParser.T__18);
                this.state = 1183;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1182;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1185;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__19:
                this.enterOuterAlt(localContext, 6);
                {
                {
                this.state = 1186;
                this.match(CypherParser.T__19);
                this.state = 1188;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1187;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1190;
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
            this.state = 1193;
            this.oC_AddOrSubtractExpression();
            this.state = 1199;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 211, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    this.state = 1197;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 210, this.context) ) {
                    case 1:
                        {
                        this.state = 1194;
                        this.oC_StringPredicateExpression();
                        }
                        break;
                    case 2:
                        {
                        this.state = 1195;
                        this.oC_ListPredicateExpression();
                        }
                        break;
                    case 3:
                        {
                        this.state = 1196;
                        this.oC_NullPredicateExpression();
                        }
                        break;
                    }
                    }
                }
                this.state = 1201;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 211, this.context);
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
            this.state = 1216;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 213, this.context) ) {
            case 1:
                {
                {
                this.state = 1202;
                this.match(CypherParser.SP);
                this.state = 1203;
                this.match(CypherParser.STARTS);
                this.state = 1204;
                this.match(CypherParser.SP);
                this.state = 1205;
                this.match(CypherParser.WITH);
                }
                }
                break;
            case 2:
                {
                {
                this.state = 1206;
                this.match(CypherParser.SP);
                this.state = 1207;
                this.match(CypherParser.ENDS);
                this.state = 1208;
                this.match(CypherParser.SP);
                this.state = 1209;
                this.match(CypherParser.WITH);
                }
                }
                break;
            case 3:
                {
                {
                this.state = 1210;
                this.match(CypherParser.SP);
                this.state = 1211;
                this.match(CypherParser.CONTAINS);
                }
                }
                break;
            case 4:
                {
                {
                this.state = 1213;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1212;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1215;
                this.match(CypherParser.T__20);
                }
                }
                break;
            }
            this.state = 1219;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1218;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1221;
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
            this.state = 1223;
            this.match(CypherParser.SP);
            this.state = 1224;
            this.match(CypherParser.IN);
            this.state = 1226;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1225;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1228;
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
            this.state = 1240;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 216, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1230;
                this.match(CypherParser.SP);
                this.state = 1231;
                this.match(CypherParser.IS);
                this.state = 1232;
                this.match(CypherParser.SP);
                this.state = 1233;
                this.match(CypherParser.NULL);
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1234;
                this.match(CypherParser.SP);
                this.state = 1235;
                this.match(CypherParser.IS);
                this.state = 1236;
                this.match(CypherParser.SP);
                this.state = 1237;
                this.match(CypherParser.NOT);
                this.state = 1238;
                this.match(CypherParser.SP);
                this.state = 1239;
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
            this.state = 1242;
            this.oC_MultiplyDivideModuloExpression();
            this.state = 1261;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 222, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    this.state = 1259;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 221, this.context) ) {
                    case 1:
                        {
                        {
                        this.state = 1244;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1243;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1246;
                        this.match(CypherParser.T__10);
                        this.state = 1248;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1247;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1250;
                        this.oC_MultiplyDivideModuloExpression();
                        }
                        }
                        break;
                    case 2:
                        {
                        {
                        this.state = 1252;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1251;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1254;
                        this.match(CypherParser.T__21);
                        this.state = 1256;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1255;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1258;
                        this.oC_MultiplyDivideModuloExpression();
                        }
                        }
                        break;
                    }
                    }
                }
                this.state = 1263;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 222, this.context);
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
            this.state = 1264;
            this.oC_PowerOfExpression();
            this.state = 1291;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 230, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    this.state = 1289;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 229, this.context) ) {
                    case 1:
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
                        this.match(CypherParser.T__4);
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
                        this.oC_PowerOfExpression();
                        }
                        }
                        break;
                    case 2:
                        {
                        {
                        this.state = 1274;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1273;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1276;
                        this.match(CypherParser.T__22);
                        this.state = 1278;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1277;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1280;
                        this.oC_PowerOfExpression();
                        }
                        }
                        break;
                    case 3:
                        {
                        {
                        this.state = 1282;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1281;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1284;
                        this.match(CypherParser.T__23);
                        this.state = 1286;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1285;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1288;
                        this.oC_PowerOfExpression();
                        }
                        }
                        break;
                    }
                    }
                }
                this.state = 1293;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 230, this.context);
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
            this.state = 1294;
            this.oC_UnaryAddOrSubtractExpression();
            this.state = 1305;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 233, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
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
                    this.match(CypherParser.T__24);
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
                    this.oC_UnaryAddOrSubtractExpression();
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
    public oC_UnaryAddOrSubtractExpression(): OC_UnaryAddOrSubtractExpressionContext {
        let localContext = new OC_UnaryAddOrSubtractExpressionContext(this.context, this.state);
        this.enterRule(localContext, 140, CypherParser.RULE_oC_UnaryAddOrSubtractExpression);
        let _la: number;
        try {
            this.state = 1314;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__1:
            case CypherParser.T__6:
            case CypherParser.T__11:
            case CypherParser.T__26:
            case CypherParser.ALL:
            case CypherParser.FOREACH:
            case CypherParser.TRANSACTIONS:
            case CypherParser.ROWS:
            case CypherParser.ROW:
            case CypherParser.SHORTESTPATH:
            case CypherParser.ALLSHORTESTPATHS:
            case CypherParser.NULL:
            case CypherParser.REDUCE:
            case CypherParser.COUNT:
            case CypherParser.CASE:
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
            case CypherParser.OF:
            case CypherParser.FILTER:
            case CypherParser.EXTRACT:
            case CypherParser.UnescapedSymbolicName:
            case CypherParser.EscapedSymbolicName:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1308;
                this.oC_NonArithmeticOperatorExpression();
                }
                break;
            case CypherParser.T__10:
            case CypherParser.T__21:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1309;
                _la = this.tokenStream.LA(1);
                if(!(_la === 11 || _la === 22)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 1311;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1310;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1313;
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
            this.state = 1316;
            this.oC_Atom();
            this.state = 1327;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 239, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    this.state = 1325;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 238, this.context) ) {
                    case 1:
                        {
                        {
                        this.state = 1318;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1317;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1320;
                        this.oC_ListOperatorExpression();
                        }
                        }
                        break;
                    case 2:
                        {
                        {
                        this.state = 1322;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1321;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1324;
                        this.oC_PropertyLookup();
                        }
                        }
                        break;
                    }
                    }
                }
                this.state = 1329;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 239, this.context);
            }
            this.state = 1334;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 241, this.context) ) {
            case 1:
                {
                this.state = 1331;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1330;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1333;
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
            this.state = 1349;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 244, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1336;
                this.match(CypherParser.T__11);
                this.state = 1337;
                this.oC_Expression();
                this.state = 1338;
                this.match(CypherParser.T__12);
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1340;
                this.match(CypherParser.T__11);
                this.state = 1342;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 3221225503) !== 0) || ((((_la - 83)) & ~0x1F) === 0 && ((1 << (_la - 83)) & 3237987265) !== 0) || ((((_la - 115)) & ~0x1F) === 0 && ((1 << (_la - 115)) & 160257) !== 0)) {
                    {
                    this.state = 1341;
                    this.oC_Expression();
                    }
                }

                this.state = 1344;
                this.match(CypherParser.T__14);
                this.state = 1346;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 3221225503) !== 0) || ((((_la - 83)) & ~0x1F) === 0 && ((1 << (_la - 83)) & 3237987265) !== 0) || ((((_la - 115)) & ~0x1F) === 0 && ((1 << (_la - 115)) & 160257) !== 0)) {
                    {
                    this.state = 1345;
                    this.oC_Expression();
                    }
                }

                this.state = 1348;
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
            this.state = 1351;
            this.match(CypherParser.T__25);
            this.state = 1353;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1352;
                this.match(CypherParser.SP);
                }
            }

            {
            this.state = 1355;
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
            this.state = 1384;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 249, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1357;
                this.oC_Literal();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1358;
                this.oC_Parameter();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 1359;
                this.oC_CaseExpression();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1360;
                this.oC_CountSubquery();
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                {
                this.state = 1361;
                this.match(CypherParser.COUNT);
                this.state = 1363;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1362;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1365;
                this.match(CypherParser.T__1);
                this.state = 1367;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1366;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1369;
                this.match(CypherParser.T__4);
                this.state = 1371;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1370;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1373;
                this.match(CypherParser.T__3);
                }
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1374;
                this.oC_ListComprehension();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 1375;
                this.oC_PatternComprehension();
                }
                break;
            case 8:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 1376;
                this.oC_Quantifier();
                }
                break;
            case 9:
                this.enterOuterAlt(localContext, 9);
                {
                this.state = 1377;
                this.oC_Reduce();
                }
                break;
            case 10:
                this.enterOuterAlt(localContext, 10);
                {
                this.state = 1378;
                this.oC_PatternPredicate();
                }
                break;
            case 11:
                this.enterOuterAlt(localContext, 11);
                {
                this.state = 1379;
                this.oC_ParenthesizedExpression();
                }
                break;
            case 12:
                this.enterOuterAlt(localContext, 12);
                {
                this.state = 1380;
                this.oC_FunctionInvocation();
                }
                break;
            case 13:
                this.enterOuterAlt(localContext, 13);
                {
                this.state = 1381;
                this.oC_ExistentialSubquery();
                }
                break;
            case 14:
                this.enterOuterAlt(localContext, 14);
                {
                this.state = 1382;
                this.oC_MapProjection();
                }
                break;
            case 15:
                this.enterOuterAlt(localContext, 15);
                {
                this.state = 1383;
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
            this.state = 1386;
            this.match(CypherParser.REDUCE);
            this.state = 1388;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1387;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1390;
            this.match(CypherParser.T__1);
            this.state = 1392;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1391;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1394;
            this.oC_Variable();
            this.state = 1396;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1395;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1398;
            this.match(CypherParser.T__8);
            this.state = 1400;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1399;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1402;
            this.oC_Expression();
            this.state = 1404;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1403;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1406;
            this.match(CypherParser.T__5);
            this.state = 1408;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1407;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1410;
            this.oC_IdInColl();
            this.state = 1412;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1411;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1414;
            this.match(CypherParser.T__2);
            this.state = 1416;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1415;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1418;
            this.oC_Expression();
            this.state = 1420;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1419;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1422;
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
            this.state = 1424;
            this.oC_Variable();
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
            this.match(CypherParser.T__6);
            this.state = 1430;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1429;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1449;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 26 || ((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294574079) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 150994943) !== 0) || ((((_la - 117)) & ~0x1F) === 0 && ((1 << (_la - 117)) & 40959) !== 0)) {
                {
                this.state = 1432;
                this.oC_MapProjectionElement();
                this.state = 1434;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1433;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1446;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1436;
                    this.match(CypherParser.T__5);
                    this.state = 1438;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1437;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1440;
                    this.oC_MapProjectionElement();
                    this.state = 1442;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1441;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1448;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1451;
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
            this.state = 1474;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 270, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1453;
                this.oC_PropertyKeyName();
                this.state = 1455;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1454;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1457;
                this.match(CypherParser.T__13);
                this.state = 1459;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1458;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1461;
                this.oC_Expression();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1463;
                this.match(CypherParser.T__25);
                this.state = 1465;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1464;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1467;
                this.oC_PropertyKeyName();
                }
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 1468;
                this.match(CypherParser.T__25);
                this.state = 1470;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1469;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1472;
                this.match(CypherParser.T__4);
                }
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1473;
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
            this.state = 1498;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 276, this.context) ) {
            case 1:
                {
                {
                this.state = 1476;
                this.match(CypherParser.CASE);
                this.state = 1481;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 1478;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1477;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1480;
                        this.oC_CaseAlternative();
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 1483;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 272, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                }
                }
                break;
            case 2:
                {
                {
                this.state = 1485;
                this.match(CypherParser.CASE);
                this.state = 1487;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1486;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1489;
                this.oC_Expression();
                this.state = 1494;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 1491;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1490;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1493;
                        this.oC_CaseAlternative();
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 1496;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 275, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                }
                }
                break;
            }
            this.state = 1508;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 279, this.context) ) {
            case 1:
                {
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
                this.match(CypherParser.ELSE);
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
                this.oC_Expression();
                }
                break;
            }
            this.state = 1511;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1510;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1513;
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
            this.state = 1515;
            this.match(CypherParser.WHEN);
            this.state = 1517;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1516;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1519;
            this.oC_Expression();
            this.state = 1521;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1520;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1523;
            this.match(CypherParser.THEN);
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
            this.state = 1529;
            this.match(CypherParser.T__11);
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
            this.oC_FilterExpression();
            this.state = 1542;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 287, this.context) ) {
            case 1:
                {
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
                this.match(CypherParser.T__2);
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
                break;
            }
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
            this.state = 1549;
            this.match(CypherParser.T__11);
            this.state = 1551;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1550;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1561;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 49)) & ~0x1F) === 0 && ((1 << (_la - 49)) & 1610612751) !== 0) || ((((_la - 90)) & ~0x1F) === 0 && ((1 << (_la - 90)) & 66435) !== 0) || ((((_la - 124)) & ~0x1F) === 0 && ((1 << (_la - 124)) & 313) !== 0)) {
                {
                this.state = 1553;
                this.oC_Variable();
                this.state = 1555;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1554;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1557;
                this.match(CypherParser.T__8);
                this.state = 1559;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1558;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1563;
            this.oC_RelationshipsPattern();
            this.state = 1565;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1564;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1571;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 77) {
                {
                this.state = 1567;
                this.oC_Where();
                this.state = 1569;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1568;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1573;
            this.match(CypherParser.T__2);
            this.state = 1575;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1574;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1577;
            this.oC_Expression();
            this.state = 1579;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1578;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1581;
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
            this.state = 1639;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.ALL:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1583;
                this.match(CypherParser.ALL);
                this.state = 1585;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1584;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1587;
                this.match(CypherParser.T__1);
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
                this.oC_FilterExpression();
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
                this.match(CypherParser.T__3);
                }
                }
                break;
            case CypherParser.ANY:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1597;
                this.match(CypherParser.ANY);
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
            case CypherParser.NONE:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 1611;
                this.match(CypherParser.NONE);
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
            case CypherParser.SINGLE:
                this.enterOuterAlt(localContext, 4);
                {
                {
                this.state = 1625;
                this.match(CypherParser.SINGLE);
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
            this.state = 1641;
            this.oC_IdInColl();
            this.state = 1646;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 312, this.context) ) {
            case 1:
                {
                this.state = 1643;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1642;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1645;
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
            this.state = 1648;
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
            this.state = 1650;
            this.match(CypherParser.T__1);
            this.state = 1652;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1651;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1654;
            this.oC_Expression();
            this.state = 1656;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1655;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1658;
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
            this.state = 1660;
            this.oC_Variable();
            this.state = 1661;
            this.match(CypherParser.SP);
            this.state = 1662;
            this.match(CypherParser.IN);
            this.state = 1663;
            this.match(CypherParser.SP);
            this.state = 1664;
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
            this.state = 1666;
            this.oC_FunctionName();
            this.state = 1668;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1667;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1670;
            this.match(CypherParser.T__1);
            this.state = 1672;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1671;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1678;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 68) {
                {
                this.state = 1674;
                this.match(CypherParser.DISTINCT);
                this.state = 1676;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1675;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1697;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 3221225503) !== 0) || ((((_la - 83)) & ~0x1F) === 0 && ((1 << (_la - 83)) & 3237987265) !== 0) || ((((_la - 115)) & ~0x1F) === 0 && ((1 << (_la - 115)) & 160257) !== 0)) {
                {
                this.state = 1680;
                this.oC_Expression();
                this.state = 1682;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1681;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1694;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1684;
                    this.match(CypherParser.T__5);
                    this.state = 1686;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1685;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1688;
                    this.oC_Expression();
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
                    }
                    this.state = 1696;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1699;
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
            this.state = 1701;
            this.oC_Namespace();
            this.state = 1702;
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
            this.state = 1704;
            this.match(CypherParser.EXISTS);
            this.state = 1706;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1705;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1708;
            this.match(CypherParser.T__6);
            this.state = 1710;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1709;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1721;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 328, this.context) ) {
            case 1:
                {
                this.state = 1712;
                this.oC_RegularQuery();
                }
                break;
            case 2:
                {
                this.state = 1713;
                this.oC_SubqueryReadings();
                }
                break;
            case 3:
                {
                {
                this.state = 1714;
                this.oC_Pattern();
                this.state = 1719;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 327, this.context) ) {
                case 1:
                    {
                    this.state = 1716;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1715;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1718;
                    this.oC_Where();
                    }
                    break;
                }
                }
                }
                break;
            }
            this.state = 1724;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1723;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1726;
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
            this.state = 1728;
            this.match(CypherParser.COUNT);
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
            this.match(CypherParser.T__6);
            this.state = 1734;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1733;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1745;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 334, this.context) ) {
            case 1:
                {
                this.state = 1736;
                this.oC_RegularQuery();
                }
                break;
            case 2:
                {
                this.state = 1737;
                this.oC_SubqueryReadings();
                }
                break;
            case 3:
                {
                {
                this.state = 1738;
                this.oC_Pattern();
                this.state = 1743;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 333, this.context) ) {
                case 1:
                    {
                    this.state = 1740;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1739;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1742;
                    this.oC_Where();
                    }
                    break;
                }
                }
                }
                break;
            }
            this.state = 1748;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1747;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1750;
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
            this.state = 1752;
            this.oC_ReadingClause();
            this.state = 1759;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 337, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
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
                    this.oC_ReadingClause();
                    }
                    }
                }
                this.state = 1761;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 337, this.context);
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
            this.state = 1762;
            this.oC_ProcedureName();
            this.state = 1764;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1763;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1766;
            this.match(CypherParser.T__1);
            this.state = 1768;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1767;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1787;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 3221225503) !== 0) || ((((_la - 83)) & ~0x1F) === 0 && ((1 << (_la - 83)) & 3237987265) !== 0) || ((((_la - 115)) & ~0x1F) === 0 && ((1 << (_la - 115)) & 160257) !== 0)) {
                {
                this.state = 1770;
                this.oC_Expression();
                this.state = 1772;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1771;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1784;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1774;
                    this.match(CypherParser.T__5);
                    this.state = 1776;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1775;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1778;
                    this.oC_Expression();
                    this.state = 1780;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1779;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1786;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1789;
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
            this.state = 1791;
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
            this.state = 1793;
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
            this.state = 1795;
            this.oC_Namespace();
            this.state = 1796;
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
            this.state = 1803;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 345, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1798;
                    this.oC_SymbolicName();
                    this.state = 1799;
                    this.match(CypherParser.T__25);
                    }
                    }
                }
                this.state = 1805;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 345, this.context);
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
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1806;
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
    public oC_Literal(): OC_LiteralContext {
        let localContext = new OC_LiteralContext(this.context, this.state);
        this.enterRule(localContext, 196, CypherParser.RULE_oC_Literal);
        try {
            this.state = 1814;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.TRUE:
            case CypherParser.FALSE:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1808;
                this.oC_BooleanLiteral();
                }
                break;
            case CypherParser.NULL:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1809;
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
                this.state = 1810;
                this.oC_NumberLiteral();
                }
                break;
            case CypherParser.StringLiteral:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1811;
                this.match(CypherParser.StringLiteral);
                }
                break;
            case CypherParser.T__11:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 1812;
                this.oC_ListLiteral();
                }
                break;
            case CypherParser.T__6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1813;
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
        this.enterRule(localContext, 198, CypherParser.RULE_oC_BooleanLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1816;
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
        this.enterRule(localContext, 200, CypherParser.RULE_oC_NumberLiteral);
        try {
            this.state = 1820;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.ExponentDecimalReal:
            case CypherParser.RegularDecimalReal:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1818;
                this.oC_DoubleLiteral();
                }
                break;
            case CypherParser.HexInteger:
            case CypherParser.DecimalInteger:
            case CypherParser.OctalInteger:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1819;
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
        this.enterRule(localContext, 202, CypherParser.RULE_oC_IntegerLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1822;
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
        this.enterRule(localContext, 204, CypherParser.RULE_oC_DoubleLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1824;
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
        this.enterRule(localContext, 206, CypherParser.RULE_oC_ListLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1826;
            this.match(CypherParser.T__11);
            this.state = 1828;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1827;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1847;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 3221225503) !== 0) || ((((_la - 83)) & ~0x1F) === 0 && ((1 << (_la - 83)) & 3237987265) !== 0) || ((((_la - 115)) & ~0x1F) === 0 && ((1 << (_la - 115)) & 160257) !== 0)) {
                {
                this.state = 1830;
                this.oC_Expression();
                this.state = 1832;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1831;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1844;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1834;
                    this.match(CypherParser.T__5);
                    this.state = 1836;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1835;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1838;
                    this.oC_Expression();
                    this.state = 1840;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1839;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1846;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1849;
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
        this.enterRule(localContext, 208, CypherParser.RULE_oC_MapLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1851;
            this.match(CypherParser.T__6);
            this.state = 1853;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1852;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1888;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294574079) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 150994943) !== 0) || ((((_la - 117)) & ~0x1F) === 0 && ((1 << (_la - 117)) & 40959) !== 0)) {
                {
                this.state = 1855;
                this.oC_PropertyKeyName();
                this.state = 1857;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1856;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1859;
                this.match(CypherParser.T__13);
                this.state = 1861;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1860;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1863;
                this.oC_Expression();
                this.state = 1865;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1864;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1885;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1867;
                    this.match(CypherParser.T__5);
                    this.state = 1869;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1868;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1871;
                    this.oC_PropertyKeyName();
                    this.state = 1873;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1872;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1875;
                    this.match(CypherParser.T__13);
                    this.state = 1877;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1876;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1879;
                    this.oC_Expression();
                    this.state = 1881;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1880;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1887;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1890;
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
        this.enterRule(localContext, 210, CypherParser.RULE_oC_PropertyKeyName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1892;
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
        this.enterRule(localContext, 212, CypherParser.RULE_oC_Parameter);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1894;
            this.match(CypherParser.T__26);
            this.state = 1897;
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
                {
                this.state = 1895;
                this.oC_SymbolicName();
                }
                break;
            case CypherParser.DecimalInteger:
                {
                this.state = 1896;
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
        this.enterRule(localContext, 214, CypherParser.RULE_oC_SchemaName);
        try {
            this.state = 1901;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 365, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1899;
                this.oC_SymbolicName();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1900;
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
        this.enterRule(localContext, 216, CypherParser.RULE_oC_ReservedWord);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1903;
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
        this.enterRule(localContext, 218, CypherParser.RULE_oC_SymbolicName);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1905;
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
        this.enterRule(localContext, 220, CypherParser.RULE_oC_LeftArrowHead);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1907;
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
        this.enterRule(localContext, 222, CypherParser.RULE_oC_RightArrowHead);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1909;
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
        this.enterRule(localContext, 224, CypherParser.RULE_oC_Dash);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1911;
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
        4,1,135,1914,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,
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
        7,109,2,110,7,110,2,111,7,111,2,112,7,112,1,0,3,0,228,8,0,1,0,1,
        0,3,0,232,8,0,1,0,3,0,235,8,0,1,0,3,0,238,8,0,1,0,1,0,1,1,1,1,1,
        2,1,2,3,2,246,8,2,1,3,1,3,3,3,250,8,3,1,3,5,3,253,8,3,10,3,12,3,
        256,9,3,1,4,1,4,1,4,1,4,3,4,262,8,4,1,4,1,4,1,4,3,4,267,8,4,1,4,
        3,4,270,8,4,1,5,1,5,3,5,274,8,5,1,6,1,6,3,6,278,8,6,5,6,280,8,6,
        10,6,12,6,283,9,6,1,6,1,6,1,6,3,6,288,8,6,5,6,290,8,6,10,6,12,6,
        293,9,6,1,6,1,6,3,6,297,8,6,1,6,5,6,300,8,6,10,6,12,6,303,9,6,1,
        6,3,6,306,8,6,1,6,3,6,309,8,6,3,6,311,8,6,1,7,1,7,3,7,315,8,7,5,
        7,317,8,7,10,7,12,7,320,9,7,1,7,1,7,3,7,324,8,7,5,7,326,8,7,10,7,
        12,7,329,9,7,1,7,1,7,3,7,333,8,7,4,7,335,8,7,11,7,12,7,336,1,7,1,
        7,1,8,1,8,1,8,1,8,1,8,1,8,1,8,3,8,348,8,8,1,9,1,9,3,9,352,8,9,1,
        9,1,9,3,9,356,8,9,1,9,1,9,1,9,1,9,1,9,1,9,3,9,364,8,9,1,9,1,9,3,
        9,368,8,9,1,9,4,9,371,8,9,11,9,12,9,372,1,9,3,9,376,8,9,1,9,1,9,
        1,10,1,10,1,10,1,10,3,10,384,8,10,1,11,1,11,3,11,388,8,11,1,11,1,
        11,3,11,392,8,11,1,11,1,11,3,11,396,8,11,1,11,1,11,1,11,3,11,401,
        8,11,1,11,1,11,3,11,405,8,11,1,11,5,11,408,8,11,10,11,12,11,411,
        9,11,3,11,413,8,11,1,11,3,11,416,8,11,1,11,1,11,3,11,420,8,11,3,
        11,422,8,11,1,11,1,11,3,11,426,8,11,1,11,1,11,3,11,430,8,11,1,11,
        1,11,1,11,1,11,1,11,1,11,1,11,1,11,1,11,1,11,1,11,1,11,3,11,444,
        8,11,3,11,446,8,11,1,12,1,12,3,12,450,8,12,1,12,1,12,3,12,454,8,
        12,1,12,1,12,3,12,458,8,12,1,12,3,12,461,8,12,1,13,1,13,3,13,465,
        8,13,1,13,1,13,1,13,1,13,1,13,1,13,1,14,1,14,3,14,475,8,14,1,14,
        1,14,1,14,5,14,480,8,14,10,14,12,14,483,9,14,1,15,1,15,1,15,1,15,
        1,15,1,15,1,15,1,15,1,15,1,15,3,15,495,8,15,1,16,1,16,3,16,499,8,
        16,1,16,1,16,1,17,1,17,3,17,505,8,17,1,17,1,17,3,17,509,8,17,1,17,
        1,17,3,17,513,8,17,1,17,5,17,516,8,17,10,17,12,17,519,9,17,1,18,
        1,18,3,18,523,8,18,1,18,1,18,3,18,527,8,18,1,18,1,18,1,18,1,18,3,
        18,533,8,18,1,18,1,18,3,18,537,8,18,1,18,1,18,1,18,1,18,3,18,543,
        8,18,1,18,1,18,3,18,547,8,18,1,18,1,18,1,18,1,18,3,18,553,8,18,1,
        18,1,18,3,18,557,8,18,1,19,1,19,3,19,561,8,19,1,19,1,19,3,19,565,
        8,19,1,19,1,19,3,19,569,8,19,1,19,1,19,3,19,573,8,19,1,19,5,19,576,
        8,19,10,19,12,19,579,9,19,1,20,1,20,1,20,1,20,3,20,585,8,20,1,20,
        1,20,3,20,589,8,20,1,20,5,20,592,8,20,10,20,12,20,595,9,20,1,21,
        1,21,1,21,1,21,3,21,601,8,21,1,22,1,22,1,22,1,22,3,22,607,8,22,1,
        22,1,22,1,22,3,22,612,8,22,1,23,1,23,1,23,1,23,3,23,618,8,23,1,23,
        3,23,621,8,23,1,23,1,23,1,23,1,23,3,23,627,8,23,3,23,629,8,23,1,
        24,1,24,3,24,633,8,24,1,24,1,24,3,24,637,8,24,1,24,5,24,640,8,24,
        10,24,12,24,643,9,24,1,24,3,24,646,8,24,1,24,3,24,649,8,24,1,25,
        1,25,1,25,1,25,1,25,3,25,656,8,25,1,25,1,25,1,26,1,26,1,26,3,26,
        663,8,26,1,26,3,26,666,8,26,1,27,1,27,1,27,1,28,3,28,672,8,28,1,
        28,3,28,675,8,28,1,28,1,28,1,28,1,28,3,28,681,8,28,1,28,1,28,3,28,
        685,8,28,1,28,1,28,3,28,689,8,28,1,29,1,29,3,29,693,8,29,1,29,1,
        29,3,29,697,8,29,1,29,5,29,700,8,29,10,29,12,29,703,9,29,1,29,1,
        29,3,29,707,8,29,1,29,1,29,3,29,711,8,29,1,29,5,29,714,8,29,10,29,
        12,29,717,9,29,3,29,719,8,29,1,30,1,30,1,30,1,30,1,30,1,30,1,30,
        3,30,728,8,30,1,31,1,31,1,31,1,31,1,31,1,31,1,31,3,31,737,8,31,1,
        31,5,31,740,8,31,10,31,12,31,743,9,31,1,32,1,32,1,32,1,32,1,33,1,
        33,1,33,1,33,1,34,1,34,3,34,755,8,34,1,34,3,34,758,8,34,1,35,1,35,
        1,35,1,35,1,36,1,36,3,36,766,8,36,1,36,1,36,3,36,770,8,36,1,36,5,
        36,773,8,36,10,36,12,36,776,9,36,1,37,1,37,3,37,780,8,37,1,37,1,
        37,3,37,784,8,37,1,37,1,37,1,37,3,37,789,8,37,1,38,1,38,3,38,793,
        8,38,1,39,1,39,3,39,797,8,39,1,39,1,39,3,39,801,8,39,1,39,1,39,3,
        39,805,8,39,1,39,1,39,1,39,1,39,3,39,811,8,39,1,39,1,39,3,39,815,
        8,39,1,39,1,39,3,39,819,8,39,1,39,1,39,3,39,823,8,39,1,40,1,40,3,
        40,827,8,40,1,40,3,40,830,8,40,1,40,1,40,1,40,3,40,835,8,40,5,40,
        837,8,40,10,40,12,40,840,9,40,1,40,1,40,1,40,1,40,3,40,846,8,40,
        1,41,1,41,3,41,850,8,41,1,41,1,41,3,41,854,8,41,1,41,3,41,857,8,
        41,1,41,3,41,860,8,41,1,41,1,41,3,41,864,8,41,1,41,1,41,1,42,1,42,
        3,42,870,8,42,1,42,4,42,873,8,42,11,42,12,42,874,1,43,1,43,3,43,
        879,8,43,1,43,1,43,3,43,883,8,43,3,43,885,8,43,1,43,1,43,3,43,889,
        8,43,3,43,891,8,43,1,43,1,43,3,43,895,8,43,3,43,897,8,43,1,43,1,
        43,1,44,1,44,3,44,903,8,44,1,44,3,44,906,8,44,1,44,3,44,909,8,44,
        1,44,1,44,1,45,1,45,1,45,1,45,3,45,917,8,45,1,45,3,45,920,8,45,1,
        45,3,45,923,8,45,1,45,1,45,3,45,927,8,45,1,45,3,45,930,8,45,1,45,
        3,45,933,8,45,3,45,935,8,45,1,45,3,45,938,8,45,1,46,1,46,3,46,942,
        8,46,1,46,1,46,3,46,946,8,46,1,46,3,46,949,8,46,1,46,3,46,952,8,
        46,1,46,1,46,3,46,956,8,46,1,46,1,46,1,46,1,46,3,46,962,8,46,1,46,
        1,46,3,46,966,8,46,1,46,3,46,969,8,46,1,46,3,46,972,8,46,1,46,1,
        46,1,46,1,46,3,46,978,8,46,1,46,3,46,981,8,46,1,46,3,46,984,8,46,
        1,46,1,46,3,46,988,8,46,1,46,1,46,1,46,1,46,3,46,994,8,46,1,46,3,
        46,997,8,46,1,46,3,46,1000,8,46,1,46,1,46,3,46,1004,8,46,1,47,1,
        47,3,47,1008,8,47,1,47,1,47,3,47,1012,8,47,3,47,1014,8,47,1,47,1,
        47,3,47,1018,8,47,3,47,1020,8,47,1,47,3,47,1023,8,47,1,47,1,47,3,
        47,1027,8,47,3,47,1029,8,47,1,47,1,47,1,48,1,48,3,48,1035,8,48,1,
        49,1,49,3,49,1039,8,49,1,49,1,49,3,49,1043,8,49,1,49,1,49,3,49,1047,
        8,49,1,49,3,49,1050,8,49,1,49,5,49,1053,8,49,10,49,12,49,1056,9,
        49,1,50,1,50,3,50,1060,8,50,1,50,5,50,1063,8,50,10,50,12,50,1066,
        9,50,1,51,1,51,3,51,1070,8,51,1,51,1,51,1,52,1,52,3,52,1076,8,52,
        1,52,1,52,3,52,1080,8,52,3,52,1082,8,52,1,52,1,52,3,52,1086,8,52,
        1,52,1,52,3,52,1090,8,52,3,52,1092,8,52,3,52,1094,8,52,1,53,1,53,
        1,54,1,54,1,55,1,55,3,55,1102,8,55,1,55,4,55,1105,8,55,11,55,12,
        55,1106,1,56,1,56,1,57,1,57,1,57,1,57,1,57,5,57,1116,8,57,10,57,
        12,57,1119,9,57,1,58,1,58,1,58,1,58,1,58,5,58,1126,8,58,10,58,12,
        58,1129,9,58,1,59,1,59,1,59,1,59,1,59,5,59,1136,8,59,10,59,12,59,
        1139,9,59,1,60,1,60,3,60,1143,8,60,5,60,1145,8,60,10,60,12,60,1148,
        9,60,1,60,1,60,1,61,1,61,3,61,1154,8,61,1,61,5,61,1157,8,61,10,61,
        12,61,1160,9,61,1,62,1,62,3,62,1164,8,62,1,62,1,62,1,62,3,62,1169,
        8,62,1,62,1,62,1,62,3,62,1174,8,62,1,62,1,62,1,62,3,62,1179,8,62,
        1,62,1,62,1,62,3,62,1184,8,62,1,62,1,62,1,62,3,62,1189,8,62,1,62,
        3,62,1192,8,62,1,63,1,63,1,63,1,63,5,63,1198,8,63,10,63,12,63,1201,
        9,63,1,64,1,64,1,64,1,64,1,64,1,64,1,64,1,64,1,64,1,64,1,64,3,64,
        1214,8,64,1,64,3,64,1217,8,64,1,64,3,64,1220,8,64,1,64,1,64,1,65,
        1,65,1,65,3,65,1227,8,65,1,65,1,65,1,66,1,66,1,66,1,66,1,66,1,66,
        1,66,1,66,1,66,1,66,3,66,1241,8,66,1,67,1,67,3,67,1245,8,67,1,67,
        1,67,3,67,1249,8,67,1,67,1,67,3,67,1253,8,67,1,67,1,67,3,67,1257,
        8,67,1,67,5,67,1260,8,67,10,67,12,67,1263,9,67,1,68,1,68,3,68,1267,
        8,68,1,68,1,68,3,68,1271,8,68,1,68,1,68,3,68,1275,8,68,1,68,1,68,
        3,68,1279,8,68,1,68,1,68,3,68,1283,8,68,1,68,1,68,3,68,1287,8,68,
        1,68,5,68,1290,8,68,10,68,12,68,1293,9,68,1,69,1,69,3,69,1297,8,
        69,1,69,1,69,3,69,1301,8,69,1,69,5,69,1304,8,69,10,69,12,69,1307,
        9,69,1,70,1,70,1,70,3,70,1312,8,70,1,70,3,70,1315,8,70,1,71,1,71,
        3,71,1319,8,71,1,71,1,71,3,71,1323,8,71,1,71,5,71,1326,8,71,10,71,
        12,71,1329,9,71,1,71,3,71,1332,8,71,1,71,3,71,1335,8,71,1,72,1,72,
        1,72,1,72,1,72,1,72,3,72,1343,8,72,1,72,1,72,3,72,1347,8,72,1,72,
        3,72,1350,8,72,1,73,1,73,3,73,1354,8,73,1,73,1,73,1,74,1,74,1,74,
        1,74,1,74,1,74,3,74,1364,8,74,1,74,1,74,3,74,1368,8,74,1,74,1,74,
        3,74,1372,8,74,1,74,1,74,1,74,1,74,1,74,1,74,1,74,1,74,1,74,1,74,
        1,74,3,74,1385,8,74,1,75,1,75,3,75,1389,8,75,1,75,1,75,3,75,1393,
        8,75,1,75,1,75,3,75,1397,8,75,1,75,1,75,3,75,1401,8,75,1,75,1,75,
        3,75,1405,8,75,1,75,1,75,3,75,1409,8,75,1,75,1,75,3,75,1413,8,75,
        1,75,1,75,3,75,1417,8,75,1,75,1,75,3,75,1421,8,75,1,75,1,75,1,76,
        1,76,3,76,1427,8,76,1,76,1,76,3,76,1431,8,76,1,76,1,76,3,76,1435,
        8,76,1,76,1,76,3,76,1439,8,76,1,76,1,76,3,76,1443,8,76,5,76,1445,
        8,76,10,76,12,76,1448,9,76,3,76,1450,8,76,1,76,1,76,1,77,1,77,3,
        77,1456,8,77,1,77,1,77,3,77,1460,8,77,1,77,1,77,1,77,1,77,3,77,1466,
        8,77,1,77,1,77,1,77,3,77,1471,8,77,1,77,1,77,3,77,1475,8,77,1,78,
        1,78,3,78,1479,8,78,1,78,4,78,1482,8,78,11,78,12,78,1483,1,78,1,
        78,3,78,1488,8,78,1,78,1,78,3,78,1492,8,78,1,78,4,78,1495,8,78,11,
        78,12,78,1496,3,78,1499,8,78,1,78,3,78,1502,8,78,1,78,1,78,3,78,
        1506,8,78,1,78,3,78,1509,8,78,1,78,3,78,1512,8,78,1,78,1,78,1,79,
        1,79,3,79,1518,8,79,1,79,1,79,3,79,1522,8,79,1,79,1,79,3,79,1526,
        8,79,1,79,1,79,1,80,1,80,3,80,1532,8,80,1,80,1,80,3,80,1536,8,80,
        1,80,1,80,3,80,1540,8,80,1,80,3,80,1543,8,80,1,80,3,80,1546,8,80,
        1,80,1,80,1,81,1,81,3,81,1552,8,81,1,81,1,81,3,81,1556,8,81,1,81,
        1,81,3,81,1560,8,81,3,81,1562,8,81,1,81,1,81,3,81,1566,8,81,1,81,
        1,81,3,81,1570,8,81,3,81,1572,8,81,1,81,1,81,3,81,1576,8,81,1,81,
        1,81,3,81,1580,8,81,1,81,1,81,1,82,1,82,3,82,1586,8,82,1,82,1,82,
        3,82,1590,8,82,1,82,1,82,3,82,1594,8,82,1,82,1,82,1,82,1,82,3,82,
        1600,8,82,1,82,1,82,3,82,1604,8,82,1,82,1,82,3,82,1608,8,82,1,82,
        1,82,1,82,1,82,3,82,1614,8,82,1,82,1,82,3,82,1618,8,82,1,82,1,82,
        3,82,1622,8,82,1,82,1,82,1,82,1,82,3,82,1628,8,82,1,82,1,82,3,82,
        1632,8,82,1,82,1,82,3,82,1636,8,82,1,82,1,82,3,82,1640,8,82,1,83,
        1,83,3,83,1644,8,83,1,83,3,83,1647,8,83,1,84,1,84,1,85,1,85,3,85,
        1653,8,85,1,85,1,85,3,85,1657,8,85,1,85,1,85,1,86,1,86,1,86,1,86,
        1,86,1,86,1,87,1,87,3,87,1669,8,87,1,87,1,87,3,87,1673,8,87,1,87,
        1,87,3,87,1677,8,87,3,87,1679,8,87,1,87,1,87,3,87,1683,8,87,1,87,
        1,87,3,87,1687,8,87,1,87,1,87,3,87,1691,8,87,5,87,1693,8,87,10,87,
        12,87,1696,9,87,3,87,1698,8,87,1,87,1,87,1,88,1,88,1,88,1,89,1,89,
        3,89,1707,8,89,1,89,1,89,3,89,1711,8,89,1,89,1,89,1,89,1,89,3,89,
        1717,8,89,1,89,3,89,1720,8,89,3,89,1722,8,89,1,89,3,89,1725,8,89,
        1,89,1,89,1,90,1,90,3,90,1731,8,90,1,90,1,90,3,90,1735,8,90,1,90,
        1,90,1,90,1,90,3,90,1741,8,90,1,90,3,90,1744,8,90,3,90,1746,8,90,
        1,90,3,90,1749,8,90,1,90,1,90,1,91,1,91,3,91,1755,8,91,1,91,5,91,
        1758,8,91,10,91,12,91,1761,9,91,1,92,1,92,3,92,1765,8,92,1,92,1,
        92,3,92,1769,8,92,1,92,1,92,3,92,1773,8,92,1,92,1,92,3,92,1777,8,
        92,1,92,1,92,3,92,1781,8,92,5,92,1783,8,92,10,92,12,92,1786,9,92,
        3,92,1788,8,92,1,92,1,92,1,93,1,93,1,94,1,94,1,95,1,95,1,95,1,96,
        1,96,1,96,5,96,1802,8,96,10,96,12,96,1805,9,96,1,97,1,97,1,98,1,
        98,1,98,1,98,1,98,1,98,3,98,1815,8,98,1,99,1,99,1,100,1,100,3,100,
        1821,8,100,1,101,1,101,1,102,1,102,1,103,1,103,3,103,1829,8,103,
        1,103,1,103,3,103,1833,8,103,1,103,1,103,3,103,1837,8,103,1,103,
        1,103,3,103,1841,8,103,5,103,1843,8,103,10,103,12,103,1846,9,103,
        3,103,1848,8,103,1,103,1,103,1,104,1,104,3,104,1854,8,104,1,104,
        1,104,3,104,1858,8,104,1,104,1,104,3,104,1862,8,104,1,104,1,104,
        3,104,1866,8,104,1,104,1,104,3,104,1870,8,104,1,104,1,104,3,104,
        1874,8,104,1,104,1,104,3,104,1878,8,104,1,104,1,104,3,104,1882,8,
        104,5,104,1884,8,104,10,104,12,104,1887,9,104,3,104,1889,8,104,1,
        104,1,104,1,105,1,105,1,106,1,106,1,106,3,106,1898,8,106,1,107,1,
        107,3,107,1902,8,107,1,108,1,108,1,109,1,109,1,110,1,110,1,111,1,
        111,1,112,1,112,1,112,0,0,113,0,2,4,6,8,10,12,14,16,18,20,22,24,
        26,28,30,32,34,36,38,40,42,44,46,48,50,52,54,56,58,60,62,64,66,68,
        70,72,74,76,78,80,82,84,86,88,90,92,94,96,98,100,102,104,106,108,
        110,112,114,116,118,120,122,124,126,128,130,132,134,136,138,140,
        142,144,146,148,150,152,154,156,158,160,162,164,166,168,170,172,
        174,176,178,180,182,184,186,188,190,192,194,196,198,200,202,204,
        206,208,210,212,214,216,218,220,222,224,0,11,1,0,51,52,1,0,73,76,
        2,0,11,11,22,22,1,0,101,102,1,0,103,105,1,0,113,114,7,0,47,48,53,
        63,66,77,80,89,92,96,100,102,117,126,8,0,49,52,78,79,90,91,97,99,
        106,106,124,124,127,129,132,132,2,0,17,17,28,31,2,0,18,18,32,35,
        2,0,22,22,36,46,2211,0,227,1,0,0,0,2,241,1,0,0,0,4,245,1,0,0,0,6,
        247,1,0,0,0,8,269,1,0,0,0,10,273,1,0,0,0,12,310,1,0,0,0,14,334,1,
        0,0,0,16,347,1,0,0,0,18,349,1,0,0,0,20,383,1,0,0,0,22,387,1,0,0,
        0,24,449,1,0,0,0,26,462,1,0,0,0,28,472,1,0,0,0,30,494,1,0,0,0,32,
        496,1,0,0,0,34,502,1,0,0,0,36,556,1,0,0,0,38,560,1,0,0,0,40,580,
        1,0,0,0,42,600,1,0,0,0,44,602,1,0,0,0,46,613,1,0,0,0,48,630,1,0,
        0,0,50,655,1,0,0,0,52,659,1,0,0,0,54,667,1,0,0,0,56,674,1,0,0,0,
        58,718,1,0,0,0,60,727,1,0,0,0,62,729,1,0,0,0,64,744,1,0,0,0,66,748,
        1,0,0,0,68,752,1,0,0,0,70,759,1,0,0,0,72,763,1,0,0,0,74,788,1,0,
        0,0,76,792,1,0,0,0,78,822,1,0,0,0,80,845,1,0,0,0,82,847,1,0,0,0,
        84,867,1,0,0,0,86,876,1,0,0,0,88,900,1,0,0,0,90,937,1,0,0,0,92,1003,
        1,0,0,0,94,1005,1,0,0,0,96,1034,1,0,0,0,98,1036,1,0,0,0,100,1057,
        1,0,0,0,102,1067,1,0,0,0,104,1073,1,0,0,0,106,1095,1,0,0,0,108,1097,
        1,0,0,0,110,1099,1,0,0,0,112,1108,1,0,0,0,114,1110,1,0,0,0,116,1120,
        1,0,0,0,118,1130,1,0,0,0,120,1146,1,0,0,0,122,1151,1,0,0,0,124,1191,
        1,0,0,0,126,1193,1,0,0,0,128,1216,1,0,0,0,130,1223,1,0,0,0,132,1240,
        1,0,0,0,134,1242,1,0,0,0,136,1264,1,0,0,0,138,1294,1,0,0,0,140,1314,
        1,0,0,0,142,1316,1,0,0,0,144,1349,1,0,0,0,146,1351,1,0,0,0,148,1384,
        1,0,0,0,150,1386,1,0,0,0,152,1424,1,0,0,0,154,1474,1,0,0,0,156,1498,
        1,0,0,0,158,1515,1,0,0,0,160,1529,1,0,0,0,162,1549,1,0,0,0,164,1639,
        1,0,0,0,166,1641,1,0,0,0,168,1648,1,0,0,0,170,1650,1,0,0,0,172,1660,
        1,0,0,0,174,1666,1,0,0,0,176,1701,1,0,0,0,178,1704,1,0,0,0,180,1728,
        1,0,0,0,182,1752,1,0,0,0,184,1762,1,0,0,0,186,1791,1,0,0,0,188,1793,
        1,0,0,0,190,1795,1,0,0,0,192,1803,1,0,0,0,194,1806,1,0,0,0,196,1814,
        1,0,0,0,198,1816,1,0,0,0,200,1820,1,0,0,0,202,1822,1,0,0,0,204,1824,
        1,0,0,0,206,1826,1,0,0,0,208,1851,1,0,0,0,210,1892,1,0,0,0,212,1894,
        1,0,0,0,214,1901,1,0,0,0,216,1903,1,0,0,0,218,1905,1,0,0,0,220,1907,
        1,0,0,0,222,1909,1,0,0,0,224,1911,1,0,0,0,226,228,5,133,0,0,227,
        226,1,0,0,0,227,228,1,0,0,0,228,229,1,0,0,0,229,234,3,2,1,0,230,
        232,5,133,0,0,231,230,1,0,0,0,231,232,1,0,0,0,232,233,1,0,0,0,233,
        235,5,1,0,0,234,231,1,0,0,0,234,235,1,0,0,0,235,237,1,0,0,0,236,
        238,5,133,0,0,237,236,1,0,0,0,237,238,1,0,0,0,238,239,1,0,0,0,239,
        240,5,0,0,1,240,1,1,0,0,0,241,242,3,4,2,0,242,3,1,0,0,0,243,246,
        3,6,3,0,244,246,3,46,23,0,245,243,1,0,0,0,245,244,1,0,0,0,246,5,
        1,0,0,0,247,254,3,10,5,0,248,250,5,133,0,0,249,248,1,0,0,0,249,250,
        1,0,0,0,250,251,1,0,0,0,251,253,3,8,4,0,252,249,1,0,0,0,253,256,
        1,0,0,0,254,252,1,0,0,0,254,255,1,0,0,0,255,7,1,0,0,0,256,254,1,
        0,0,0,257,258,5,47,0,0,258,259,5,133,0,0,259,261,5,48,0,0,260,262,
        5,133,0,0,261,260,1,0,0,0,261,262,1,0,0,0,262,263,1,0,0,0,263,270,
        3,10,5,0,264,266,5,47,0,0,265,267,5,133,0,0,266,265,1,0,0,0,266,
        267,1,0,0,0,267,268,1,0,0,0,268,270,3,10,5,0,269,257,1,0,0,0,269,
        264,1,0,0,0,270,9,1,0,0,0,271,274,3,12,6,0,272,274,3,14,7,0,273,
        271,1,0,0,0,273,272,1,0,0,0,274,11,1,0,0,0,275,277,3,20,10,0,276,
        278,5,133,0,0,277,276,1,0,0,0,277,278,1,0,0,0,278,280,1,0,0,0,279,
        275,1,0,0,0,280,283,1,0,0,0,281,279,1,0,0,0,281,282,1,0,0,0,282,
        284,1,0,0,0,283,281,1,0,0,0,284,311,3,54,27,0,285,287,3,20,10,0,
        286,288,5,133,0,0,287,286,1,0,0,0,287,288,1,0,0,0,288,290,1,0,0,
        0,289,285,1,0,0,0,290,293,1,0,0,0,291,289,1,0,0,0,291,292,1,0,0,
        0,292,294,1,0,0,0,293,291,1,0,0,0,294,301,3,16,8,0,295,297,5,133,
        0,0,296,295,1,0,0,0,296,297,1,0,0,0,297,298,1,0,0,0,298,300,3,16,
        8,0,299,296,1,0,0,0,300,303,1,0,0,0,301,299,1,0,0,0,301,302,1,0,
        0,0,302,308,1,0,0,0,303,301,1,0,0,0,304,306,5,133,0,0,305,304,1,
        0,0,0,305,306,1,0,0,0,306,307,1,0,0,0,307,309,3,54,27,0,308,305,
        1,0,0,0,308,309,1,0,0,0,309,311,1,0,0,0,310,281,1,0,0,0,310,291,
        1,0,0,0,311,13,1,0,0,0,312,314,3,20,10,0,313,315,5,133,0,0,314,313,
        1,0,0,0,314,315,1,0,0,0,315,317,1,0,0,0,316,312,1,0,0,0,317,320,
        1,0,0,0,318,316,1,0,0,0,318,319,1,0,0,0,319,327,1,0,0,0,320,318,
        1,0,0,0,321,323,3,16,8,0,322,324,5,133,0,0,323,322,1,0,0,0,323,324,
        1,0,0,0,324,326,1,0,0,0,325,321,1,0,0,0,326,329,1,0,0,0,327,325,
        1,0,0,0,327,328,1,0,0,0,328,330,1,0,0,0,329,327,1,0,0,0,330,332,
        3,52,26,0,331,333,5,133,0,0,332,331,1,0,0,0,332,333,1,0,0,0,333,
        335,1,0,0,0,334,318,1,0,0,0,335,336,1,0,0,0,336,334,1,0,0,0,336,
        337,1,0,0,0,337,338,1,0,0,0,338,339,3,12,6,0,339,15,1,0,0,0,340,
        348,3,32,16,0,341,348,3,28,14,0,342,348,3,38,19,0,343,348,3,34,17,
        0,344,348,3,40,20,0,345,348,3,18,9,0,346,348,3,22,11,0,347,340,1,
        0,0,0,347,341,1,0,0,0,347,342,1,0,0,0,347,343,1,0,0,0,347,344,1,
        0,0,0,347,345,1,0,0,0,347,346,1,0,0,0,348,17,1,0,0,0,349,351,5,49,
        0,0,350,352,5,133,0,0,351,350,1,0,0,0,351,352,1,0,0,0,352,353,1,
        0,0,0,353,355,5,2,0,0,354,356,5,133,0,0,355,354,1,0,0,0,355,356,
        1,0,0,0,356,357,1,0,0,0,357,358,3,194,97,0,358,359,5,133,0,0,359,
        360,5,87,0,0,360,361,5,133,0,0,361,363,3,112,56,0,362,364,5,133,
        0,0,363,362,1,0,0,0,363,364,1,0,0,0,364,365,1,0,0,0,365,370,5,3,
        0,0,366,368,5,133,0,0,367,366,1,0,0,0,367,368,1,0,0,0,368,369,1,
        0,0,0,369,371,3,16,8,0,370,367,1,0,0,0,371,372,1,0,0,0,372,370,1,
        0,0,0,372,373,1,0,0,0,373,375,1,0,0,0,374,376,5,133,0,0,375,374,
        1,0,0,0,375,376,1,0,0,0,376,377,1,0,0,0,377,378,5,4,0,0,378,19,1,
        0,0,0,379,384,3,24,12,0,380,384,3,26,13,0,381,384,3,22,11,0,382,
        384,3,44,22,0,383,379,1,0,0,0,383,380,1,0,0,0,383,381,1,0,0,0,383,
        382,1,0,0,0,384,21,1,0,0,0,385,386,5,53,0,0,386,388,5,133,0,0,387,
        385,1,0,0,0,387,388,1,0,0,0,388,389,1,0,0,0,389,391,5,64,0,0,390,
        392,5,133,0,0,391,390,1,0,0,0,391,392,1,0,0,0,392,421,1,0,0,0,393,
        395,5,2,0,0,394,396,5,133,0,0,395,394,1,0,0,0,395,396,1,0,0,0,396,
        412,1,0,0,0,397,413,5,5,0,0,398,409,3,194,97,0,399,401,5,133,0,0,
        400,399,1,0,0,0,400,401,1,0,0,0,401,402,1,0,0,0,402,404,5,6,0,0,
        403,405,5,133,0,0,404,403,1,0,0,0,404,405,1,0,0,0,405,406,1,0,0,
        0,406,408,3,194,97,0,407,400,1,0,0,0,408,411,1,0,0,0,409,407,1,0,
        0,0,409,410,1,0,0,0,410,413,1,0,0,0,411,409,1,0,0,0,412,397,1,0,
        0,0,412,398,1,0,0,0,412,413,1,0,0,0,413,415,1,0,0,0,414,416,5,133,
        0,0,415,414,1,0,0,0,415,416,1,0,0,0,416,417,1,0,0,0,417,419,5,4,
        0,0,418,420,5,133,0,0,419,418,1,0,0,0,419,420,1,0,0,0,420,422,1,
        0,0,0,421,393,1,0,0,0,421,422,1,0,0,0,422,423,1,0,0,0,423,425,5,
        7,0,0,424,426,5,133,0,0,425,424,1,0,0,0,425,426,1,0,0,0,426,427,
        1,0,0,0,427,429,3,6,3,0,428,430,5,133,0,0,429,428,1,0,0,0,429,430,
        1,0,0,0,430,431,1,0,0,0,431,445,5,8,0,0,432,433,5,133,0,0,433,434,
        5,87,0,0,434,435,5,133,0,0,435,443,5,50,0,0,436,437,5,133,0,0,437,
        438,5,124,0,0,438,439,5,133,0,0,439,440,3,112,56,0,440,441,5,133,
        0,0,441,442,7,0,0,0,442,444,1,0,0,0,443,436,1,0,0,0,443,444,1,0,
        0,0,444,446,1,0,0,0,445,432,1,0,0,0,445,446,1,0,0,0,446,23,1,0,0,
        0,447,448,5,53,0,0,448,450,5,133,0,0,449,447,1,0,0,0,449,450,1,0,
        0,0,450,451,1,0,0,0,451,453,5,54,0,0,452,454,5,133,0,0,453,452,1,
        0,0,0,453,454,1,0,0,0,454,455,1,0,0,0,455,460,3,72,36,0,456,458,
        5,133,0,0,457,456,1,0,0,0,457,458,1,0,0,0,458,459,1,0,0,0,459,461,
        3,70,35,0,460,457,1,0,0,0,460,461,1,0,0,0,461,25,1,0,0,0,462,464,
        5,55,0,0,463,465,5,133,0,0,464,463,1,0,0,0,464,465,1,0,0,0,465,466,
        1,0,0,0,466,467,3,112,56,0,467,468,5,133,0,0,468,469,5,56,0,0,469,
        470,5,133,0,0,470,471,3,194,97,0,471,27,1,0,0,0,472,474,5,57,0,0,
        473,475,5,133,0,0,474,473,1,0,0,0,474,475,1,0,0,0,475,476,1,0,0,
        0,476,481,3,74,37,0,477,478,5,133,0,0,478,480,3,30,15,0,479,477,
        1,0,0,0,480,483,1,0,0,0,481,479,1,0,0,0,481,482,1,0,0,0,482,29,1,
        0,0,0,483,481,1,0,0,0,484,485,5,58,0,0,485,486,5,133,0,0,486,487,
        5,54,0,0,487,488,5,133,0,0,488,495,3,34,17,0,489,490,5,58,0,0,490,
        491,5,133,0,0,491,492,5,59,0,0,492,493,5,133,0,0,493,495,3,34,17,
        0,494,484,1,0,0,0,494,489,1,0,0,0,495,31,1,0,0,0,496,498,5,59,0,
        0,497,499,5,133,0,0,498,497,1,0,0,0,498,499,1,0,0,0,499,500,1,0,
        0,0,500,501,3,72,36,0,501,33,1,0,0,0,502,504,5,60,0,0,503,505,5,
        133,0,0,504,503,1,0,0,0,504,505,1,0,0,0,505,506,1,0,0,0,506,517,
        3,36,18,0,507,509,5,133,0,0,508,507,1,0,0,0,508,509,1,0,0,0,509,
        510,1,0,0,0,510,512,5,6,0,0,511,513,5,133,0,0,512,511,1,0,0,0,512,
        513,1,0,0,0,513,514,1,0,0,0,514,516,3,36,18,0,515,508,1,0,0,0,516,
        519,1,0,0,0,517,515,1,0,0,0,517,518,1,0,0,0,518,35,1,0,0,0,519,517,
        1,0,0,0,520,522,3,110,55,0,521,523,5,133,0,0,522,521,1,0,0,0,522,
        523,1,0,0,0,523,524,1,0,0,0,524,526,5,9,0,0,525,527,5,133,0,0,526,
        525,1,0,0,0,526,527,1,0,0,0,527,528,1,0,0,0,528,529,3,112,56,0,529,
        557,1,0,0,0,530,532,3,194,97,0,531,533,5,133,0,0,532,531,1,0,0,0,
        532,533,1,0,0,0,533,534,1,0,0,0,534,536,5,9,0,0,535,537,5,133,0,
        0,536,535,1,0,0,0,536,537,1,0,0,0,537,538,1,0,0,0,538,539,3,112,
        56,0,539,557,1,0,0,0,540,542,3,194,97,0,541,543,5,133,0,0,542,541,
        1,0,0,0,542,543,1,0,0,0,543,544,1,0,0,0,544,546,5,10,0,0,545,547,
        5,133,0,0,546,545,1,0,0,0,546,547,1,0,0,0,547,548,1,0,0,0,548,549,
        3,112,56,0,549,557,1,0,0,0,550,552,3,194,97,0,551,553,5,133,0,0,
        552,551,1,0,0,0,552,553,1,0,0,0,553,554,1,0,0,0,554,555,3,100,50,
        0,555,557,1,0,0,0,556,520,1,0,0,0,556,530,1,0,0,0,556,540,1,0,0,
        0,556,550,1,0,0,0,557,37,1,0,0,0,558,559,5,61,0,0,559,561,5,133,
        0,0,560,558,1,0,0,0,560,561,1,0,0,0,561,562,1,0,0,0,562,564,5,62,
        0,0,563,565,5,133,0,0,564,563,1,0,0,0,564,565,1,0,0,0,565,566,1,
        0,0,0,566,577,3,112,56,0,567,569,5,133,0,0,568,567,1,0,0,0,568,569,
        1,0,0,0,569,570,1,0,0,0,570,572,5,6,0,0,571,573,5,133,0,0,572,571,
        1,0,0,0,572,573,1,0,0,0,573,574,1,0,0,0,574,576,3,112,56,0,575,568,
        1,0,0,0,576,579,1,0,0,0,577,575,1,0,0,0,577,578,1,0,0,0,578,39,1,
        0,0,0,579,577,1,0,0,0,580,581,5,63,0,0,581,582,5,133,0,0,582,593,
        3,42,21,0,583,585,5,133,0,0,584,583,1,0,0,0,584,585,1,0,0,0,585,
        586,1,0,0,0,586,588,5,6,0,0,587,589,5,133,0,0,588,587,1,0,0,0,588,
        589,1,0,0,0,589,590,1,0,0,0,590,592,3,42,21,0,591,584,1,0,0,0,592,
        595,1,0,0,0,593,591,1,0,0,0,593,594,1,0,0,0,594,41,1,0,0,0,595,593,
        1,0,0,0,596,597,3,194,97,0,597,598,3,100,50,0,598,601,1,0,0,0,599,
        601,3,110,55,0,600,596,1,0,0,0,600,599,1,0,0,0,601,43,1,0,0,0,602,
        603,5,64,0,0,603,604,5,133,0,0,604,611,3,184,92,0,605,607,5,133,
        0,0,606,605,1,0,0,0,606,607,1,0,0,0,607,608,1,0,0,0,608,609,5,65,
        0,0,609,610,5,133,0,0,610,612,3,48,24,0,611,606,1,0,0,0,611,612,
        1,0,0,0,612,45,1,0,0,0,613,614,5,64,0,0,614,617,5,133,0,0,615,618,
        3,184,92,0,616,618,3,186,93,0,617,615,1,0,0,0,617,616,1,0,0,0,618,
        628,1,0,0,0,619,621,5,133,0,0,620,619,1,0,0,0,620,621,1,0,0,0,621,
        622,1,0,0,0,622,623,5,65,0,0,623,626,5,133,0,0,624,627,5,5,0,0,625,
        627,3,48,24,0,626,624,1,0,0,0,626,625,1,0,0,0,627,629,1,0,0,0,628,
        620,1,0,0,0,628,629,1,0,0,0,629,47,1,0,0,0,630,641,3,50,25,0,631,
        633,5,133,0,0,632,631,1,0,0,0,632,633,1,0,0,0,633,634,1,0,0,0,634,
        636,5,6,0,0,635,637,5,133,0,0,636,635,1,0,0,0,636,637,1,0,0,0,637,
        638,1,0,0,0,638,640,3,50,25,0,639,632,1,0,0,0,640,643,1,0,0,0,641,
        639,1,0,0,0,641,642,1,0,0,0,642,648,1,0,0,0,643,641,1,0,0,0,644,
        646,5,133,0,0,645,644,1,0,0,0,645,646,1,0,0,0,646,647,1,0,0,0,647,
        649,3,70,35,0,648,645,1,0,0,0,648,649,1,0,0,0,649,49,1,0,0,0,650,
        651,3,188,94,0,651,652,5,133,0,0,652,653,5,56,0,0,653,654,5,133,
        0,0,654,656,1,0,0,0,655,650,1,0,0,0,655,656,1,0,0,0,656,657,1,0,
        0,0,657,658,3,194,97,0,658,51,1,0,0,0,659,660,5,66,0,0,660,665,3,
        56,28,0,661,663,5,133,0,0,662,661,1,0,0,0,662,663,1,0,0,0,663,664,
        1,0,0,0,664,666,3,70,35,0,665,662,1,0,0,0,665,666,1,0,0,0,666,53,
        1,0,0,0,667,668,5,67,0,0,668,669,3,56,28,0,669,55,1,0,0,0,670,672,
        5,133,0,0,671,670,1,0,0,0,671,672,1,0,0,0,672,673,1,0,0,0,673,675,
        5,68,0,0,674,671,1,0,0,0,674,675,1,0,0,0,675,676,1,0,0,0,676,677,
        5,133,0,0,677,680,3,58,29,0,678,679,5,133,0,0,679,681,3,62,31,0,
        680,678,1,0,0,0,680,681,1,0,0,0,681,684,1,0,0,0,682,683,5,133,0,
        0,683,685,3,64,32,0,684,682,1,0,0,0,684,685,1,0,0,0,685,688,1,0,
        0,0,686,687,5,133,0,0,687,689,3,66,33,0,688,686,1,0,0,0,688,689,
        1,0,0,0,689,57,1,0,0,0,690,701,5,5,0,0,691,693,5,133,0,0,692,691,
        1,0,0,0,692,693,1,0,0,0,693,694,1,0,0,0,694,696,5,6,0,0,695,697,
        5,133,0,0,696,695,1,0,0,0,696,697,1,0,0,0,697,698,1,0,0,0,698,700,
        3,60,30,0,699,692,1,0,0,0,700,703,1,0,0,0,701,699,1,0,0,0,701,702,
        1,0,0,0,702,719,1,0,0,0,703,701,1,0,0,0,704,715,3,60,30,0,705,707,
        5,133,0,0,706,705,1,0,0,0,706,707,1,0,0,0,707,708,1,0,0,0,708,710,
        5,6,0,0,709,711,5,133,0,0,710,709,1,0,0,0,710,711,1,0,0,0,711,712,
        1,0,0,0,712,714,3,60,30,0,713,706,1,0,0,0,714,717,1,0,0,0,715,713,
        1,0,0,0,715,716,1,0,0,0,716,719,1,0,0,0,717,715,1,0,0,0,718,690,
        1,0,0,0,718,704,1,0,0,0,719,59,1,0,0,0,720,721,3,112,56,0,721,722,
        5,133,0,0,722,723,5,56,0,0,723,724,5,133,0,0,724,725,3,194,97,0,
        725,728,1,0,0,0,726,728,3,112,56,0,727,720,1,0,0,0,727,726,1,0,0,
        0,728,61,1,0,0,0,729,730,5,69,0,0,730,731,5,133,0,0,731,732,5,70,
        0,0,732,733,5,133,0,0,733,741,3,68,34,0,734,736,5,6,0,0,735,737,
        5,133,0,0,736,735,1,0,0,0,736,737,1,0,0,0,737,738,1,0,0,0,738,740,
        3,68,34,0,739,734,1,0,0,0,740,743,1,0,0,0,741,739,1,0,0,0,741,742,
        1,0,0,0,742,63,1,0,0,0,743,741,1,0,0,0,744,745,5,71,0,0,745,746,
        5,133,0,0,746,747,3,112,56,0,747,65,1,0,0,0,748,749,5,72,0,0,749,
        750,5,133,0,0,750,751,3,112,56,0,751,67,1,0,0,0,752,757,3,112,56,
        0,753,755,5,133,0,0,754,753,1,0,0,0,754,755,1,0,0,0,755,756,1,0,
        0,0,756,758,7,1,0,0,757,754,1,0,0,0,757,758,1,0,0,0,758,69,1,0,0,
        0,759,760,5,77,0,0,760,761,5,133,0,0,761,762,3,112,56,0,762,71,1,
        0,0,0,763,774,3,74,37,0,764,766,5,133,0,0,765,764,1,0,0,0,765,766,
        1,0,0,0,766,767,1,0,0,0,767,769,5,6,0,0,768,770,5,133,0,0,769,768,
        1,0,0,0,769,770,1,0,0,0,770,771,1,0,0,0,771,773,3,74,37,0,772,765,
        1,0,0,0,773,776,1,0,0,0,774,772,1,0,0,0,774,775,1,0,0,0,775,73,1,
        0,0,0,776,774,1,0,0,0,777,779,3,194,97,0,778,780,5,133,0,0,779,778,
        1,0,0,0,779,780,1,0,0,0,780,781,1,0,0,0,781,783,5,9,0,0,782,784,
        5,133,0,0,783,782,1,0,0,0,783,784,1,0,0,0,784,785,1,0,0,0,785,786,
        3,76,38,0,786,789,1,0,0,0,787,789,3,76,38,0,788,777,1,0,0,0,788,
        787,1,0,0,0,789,75,1,0,0,0,790,793,3,78,39,0,791,793,3,80,40,0,792,
        790,1,0,0,0,792,791,1,0,0,0,793,77,1,0,0,0,794,796,5,78,0,0,795,
        797,5,133,0,0,796,795,1,0,0,0,796,797,1,0,0,0,797,798,1,0,0,0,798,
        800,5,2,0,0,799,801,5,133,0,0,800,799,1,0,0,0,800,801,1,0,0,0,801,
        802,1,0,0,0,802,804,3,80,40,0,803,805,5,133,0,0,804,803,1,0,0,0,
        804,805,1,0,0,0,805,806,1,0,0,0,806,807,5,4,0,0,807,823,1,0,0,0,
        808,810,5,79,0,0,809,811,5,133,0,0,810,809,1,0,0,0,810,811,1,0,0,
        0,811,812,1,0,0,0,812,814,5,2,0,0,813,815,5,133,0,0,814,813,1,0,
        0,0,814,815,1,0,0,0,815,816,1,0,0,0,816,818,3,80,40,0,817,819,5,
        133,0,0,818,817,1,0,0,0,818,819,1,0,0,0,819,820,1,0,0,0,820,821,
        5,4,0,0,821,823,1,0,0,0,822,794,1,0,0,0,822,808,1,0,0,0,823,79,1,
        0,0,0,824,827,3,86,43,0,825,827,3,82,41,0,826,824,1,0,0,0,826,825,
        1,0,0,0,827,838,1,0,0,0,828,830,5,133,0,0,829,828,1,0,0,0,829,830,
        1,0,0,0,830,834,1,0,0,0,831,835,3,88,44,0,832,835,3,82,41,0,833,
        835,3,86,43,0,834,831,1,0,0,0,834,832,1,0,0,0,834,833,1,0,0,0,835,
        837,1,0,0,0,836,829,1,0,0,0,837,840,1,0,0,0,838,836,1,0,0,0,838,
        839,1,0,0,0,839,846,1,0,0,0,840,838,1,0,0,0,841,842,5,2,0,0,842,
        843,3,80,40,0,843,844,5,4,0,0,844,846,1,0,0,0,845,826,1,0,0,0,845,
        841,1,0,0,0,846,81,1,0,0,0,847,849,5,2,0,0,848,850,5,133,0,0,849,
        848,1,0,0,0,849,850,1,0,0,0,850,851,1,0,0,0,851,856,3,80,40,0,852,
        854,5,133,0,0,853,852,1,0,0,0,853,854,1,0,0,0,854,855,1,0,0,0,855,
        857,3,70,35,0,856,853,1,0,0,0,856,857,1,0,0,0,857,859,1,0,0,0,858,
        860,5,133,0,0,859,858,1,0,0,0,859,860,1,0,0,0,860,861,1,0,0,0,861,
        863,5,4,0,0,862,864,5,133,0,0,863,862,1,0,0,0,863,864,1,0,0,0,864,
        865,1,0,0,0,865,866,3,90,45,0,866,83,1,0,0,0,867,872,3,86,43,0,868,
        870,5,133,0,0,869,868,1,0,0,0,869,870,1,0,0,0,870,871,1,0,0,0,871,
        873,3,88,44,0,872,869,1,0,0,0,873,874,1,0,0,0,874,872,1,0,0,0,874,
        875,1,0,0,0,875,85,1,0,0,0,876,878,5,2,0,0,877,879,5,133,0,0,878,
        877,1,0,0,0,878,879,1,0,0,0,879,884,1,0,0,0,880,882,3,194,97,0,881,
        883,5,133,0,0,882,881,1,0,0,0,882,883,1,0,0,0,883,885,1,0,0,0,884,
        880,1,0,0,0,884,885,1,0,0,0,885,890,1,0,0,0,886,888,3,100,50,0,887,
        889,5,133,0,0,888,887,1,0,0,0,888,889,1,0,0,0,889,891,1,0,0,0,890,
        886,1,0,0,0,890,891,1,0,0,0,891,896,1,0,0,0,892,894,3,96,48,0,893,
        895,5,133,0,0,894,893,1,0,0,0,894,895,1,0,0,0,895,897,1,0,0,0,896,
        892,1,0,0,0,896,897,1,0,0,0,897,898,1,0,0,0,898,899,5,4,0,0,899,
        87,1,0,0,0,900,905,3,92,46,0,901,903,5,133,0,0,902,901,1,0,0,0,902,
        903,1,0,0,0,903,904,1,0,0,0,904,906,3,90,45,0,905,902,1,0,0,0,905,
        906,1,0,0,0,906,908,1,0,0,0,907,909,5,133,0,0,908,907,1,0,0,0,908,
        909,1,0,0,0,909,910,1,0,0,0,910,911,3,86,43,0,911,89,1,0,0,0,912,
        938,5,11,0,0,913,938,5,5,0,0,914,916,5,7,0,0,915,917,5,133,0,0,916,
        915,1,0,0,0,916,917,1,0,0,0,917,919,1,0,0,0,918,920,3,202,101,0,
        919,918,1,0,0,0,919,920,1,0,0,0,920,922,1,0,0,0,921,923,5,133,0,
        0,922,921,1,0,0,0,922,923,1,0,0,0,923,934,1,0,0,0,924,926,5,6,0,
        0,925,927,5,133,0,0,926,925,1,0,0,0,926,927,1,0,0,0,927,929,1,0,
        0,0,928,930,3,202,101,0,929,928,1,0,0,0,929,930,1,0,0,0,930,932,
        1,0,0,0,931,933,5,133,0,0,932,931,1,0,0,0,932,933,1,0,0,0,933,935,
        1,0,0,0,934,924,1,0,0,0,934,935,1,0,0,0,935,936,1,0,0,0,936,938,
        5,8,0,0,937,912,1,0,0,0,937,913,1,0,0,0,937,914,1,0,0,0,938,91,1,
        0,0,0,939,941,3,220,110,0,940,942,5,133,0,0,941,940,1,0,0,0,941,
        942,1,0,0,0,942,943,1,0,0,0,943,945,3,224,112,0,944,946,5,133,0,
        0,945,944,1,0,0,0,945,946,1,0,0,0,946,948,1,0,0,0,947,949,3,94,47,
        0,948,947,1,0,0,0,948,949,1,0,0,0,949,951,1,0,0,0,950,952,5,133,
        0,0,951,950,1,0,0,0,951,952,1,0,0,0,952,953,1,0,0,0,953,955,3,224,
        112,0,954,956,5,133,0,0,955,954,1,0,0,0,955,956,1,0,0,0,956,957,
        1,0,0,0,957,958,3,222,111,0,958,1004,1,0,0,0,959,961,3,220,110,0,
        960,962,5,133,0,0,961,960,1,0,0,0,961,962,1,0,0,0,962,963,1,0,0,
        0,963,965,3,224,112,0,964,966,5,133,0,0,965,964,1,0,0,0,965,966,
        1,0,0,0,966,968,1,0,0,0,967,969,3,94,47,0,968,967,1,0,0,0,968,969,
        1,0,0,0,969,971,1,0,0,0,970,972,5,133,0,0,971,970,1,0,0,0,971,972,
        1,0,0,0,972,973,1,0,0,0,973,974,3,224,112,0,974,1004,1,0,0,0,975,
        977,3,224,112,0,976,978,5,133,0,0,977,976,1,0,0,0,977,978,1,0,0,
        0,978,980,1,0,0,0,979,981,3,94,47,0,980,979,1,0,0,0,980,981,1,0,
        0,0,981,983,1,0,0,0,982,984,5,133,0,0,983,982,1,0,0,0,983,984,1,
        0,0,0,984,985,1,0,0,0,985,987,3,224,112,0,986,988,5,133,0,0,987,
        986,1,0,0,0,987,988,1,0,0,0,988,989,1,0,0,0,989,990,3,222,111,0,
        990,1004,1,0,0,0,991,993,3,224,112,0,992,994,5,133,0,0,993,992,1,
        0,0,0,993,994,1,0,0,0,994,996,1,0,0,0,995,997,3,94,47,0,996,995,
        1,0,0,0,996,997,1,0,0,0,997,999,1,0,0,0,998,1000,5,133,0,0,999,998,
        1,0,0,0,999,1000,1,0,0,0,1000,1001,1,0,0,0,1001,1002,3,224,112,0,
        1002,1004,1,0,0,0,1003,939,1,0,0,0,1003,959,1,0,0,0,1003,975,1,0,
        0,0,1003,991,1,0,0,0,1004,93,1,0,0,0,1005,1007,5,12,0,0,1006,1008,
        5,133,0,0,1007,1006,1,0,0,0,1007,1008,1,0,0,0,1008,1013,1,0,0,0,
        1009,1011,3,194,97,0,1010,1012,5,133,0,0,1011,1010,1,0,0,0,1011,
        1012,1,0,0,0,1012,1014,1,0,0,0,1013,1009,1,0,0,0,1013,1014,1,0,0,
        0,1014,1019,1,0,0,0,1015,1017,3,98,49,0,1016,1018,5,133,0,0,1017,
        1016,1,0,0,0,1017,1018,1,0,0,0,1018,1020,1,0,0,0,1019,1015,1,0,0,
        0,1019,1020,1,0,0,0,1020,1022,1,0,0,0,1021,1023,3,104,52,0,1022,
        1021,1,0,0,0,1022,1023,1,0,0,0,1023,1028,1,0,0,0,1024,1026,3,96,
        48,0,1025,1027,5,133,0,0,1026,1025,1,0,0,0,1026,1027,1,0,0,0,1027,
        1029,1,0,0,0,1028,1024,1,0,0,0,1028,1029,1,0,0,0,1029,1030,1,0,0,
        0,1030,1031,5,13,0,0,1031,95,1,0,0,0,1032,1035,3,208,104,0,1033,
        1035,3,212,106,0,1034,1032,1,0,0,0,1034,1033,1,0,0,0,1035,97,1,0,
        0,0,1036,1038,5,14,0,0,1037,1039,5,133,0,0,1038,1037,1,0,0,0,1038,
        1039,1,0,0,0,1039,1040,1,0,0,0,1040,1054,3,108,54,0,1041,1043,5,
        133,0,0,1042,1041,1,0,0,0,1042,1043,1,0,0,0,1043,1044,1,0,0,0,1044,
        1046,5,3,0,0,1045,1047,5,14,0,0,1046,1045,1,0,0,0,1046,1047,1,0,
        0,0,1047,1049,1,0,0,0,1048,1050,5,133,0,0,1049,1048,1,0,0,0,1049,
        1050,1,0,0,0,1050,1051,1,0,0,0,1051,1053,3,108,54,0,1052,1042,1,
        0,0,0,1053,1056,1,0,0,0,1054,1052,1,0,0,0,1054,1055,1,0,0,0,1055,
        99,1,0,0,0,1056,1054,1,0,0,0,1057,1064,3,102,51,0,1058,1060,5,133,
        0,0,1059,1058,1,0,0,0,1059,1060,1,0,0,0,1060,1061,1,0,0,0,1061,1063,
        3,102,51,0,1062,1059,1,0,0,0,1063,1066,1,0,0,0,1064,1062,1,0,0,0,
        1064,1065,1,0,0,0,1065,101,1,0,0,0,1066,1064,1,0,0,0,1067,1069,5,
        14,0,0,1068,1070,5,133,0,0,1069,1068,1,0,0,0,1069,1070,1,0,0,0,1070,
        1071,1,0,0,0,1071,1072,3,106,53,0,1072,103,1,0,0,0,1073,1075,5,5,
        0,0,1074,1076,5,133,0,0,1075,1074,1,0,0,0,1075,1076,1,0,0,0,1076,
        1081,1,0,0,0,1077,1079,3,202,101,0,1078,1080,5,133,0,0,1079,1078,
        1,0,0,0,1079,1080,1,0,0,0,1080,1082,1,0,0,0,1081,1077,1,0,0,0,1081,
        1082,1,0,0,0,1082,1093,1,0,0,0,1083,1085,5,15,0,0,1084,1086,5,133,
        0,0,1085,1084,1,0,0,0,1085,1086,1,0,0,0,1086,1091,1,0,0,0,1087,1089,
        3,202,101,0,1088,1090,5,133,0,0,1089,1088,1,0,0,0,1089,1090,1,0,
        0,0,1090,1092,1,0,0,0,1091,1087,1,0,0,0,1091,1092,1,0,0,0,1092,1094,
        1,0,0,0,1093,1083,1,0,0,0,1093,1094,1,0,0,0,1094,105,1,0,0,0,1095,
        1096,3,214,107,0,1096,107,1,0,0,0,1097,1098,3,214,107,0,1098,109,
        1,0,0,0,1099,1104,3,148,74,0,1100,1102,5,133,0,0,1101,1100,1,0,0,
        0,1101,1102,1,0,0,0,1102,1103,1,0,0,0,1103,1105,3,146,73,0,1104,
        1101,1,0,0,0,1105,1106,1,0,0,0,1106,1104,1,0,0,0,1106,1107,1,0,0,
        0,1107,111,1,0,0,0,1108,1109,3,114,57,0,1109,113,1,0,0,0,1110,1117,
        3,116,58,0,1111,1112,5,133,0,0,1112,1113,5,80,0,0,1113,1114,5,133,
        0,0,1114,1116,3,116,58,0,1115,1111,1,0,0,0,1116,1119,1,0,0,0,1117,
        1115,1,0,0,0,1117,1118,1,0,0,0,1118,115,1,0,0,0,1119,1117,1,0,0,
        0,1120,1127,3,118,59,0,1121,1122,5,133,0,0,1122,1123,5,81,0,0,1123,
        1124,5,133,0,0,1124,1126,3,118,59,0,1125,1121,1,0,0,0,1126,1129,
        1,0,0,0,1127,1125,1,0,0,0,1127,1128,1,0,0,0,1128,117,1,0,0,0,1129,
        1127,1,0,0,0,1130,1137,3,120,60,0,1131,1132,5,133,0,0,1132,1133,
        5,82,0,0,1133,1134,5,133,0,0,1134,1136,3,120,60,0,1135,1131,1,0,
        0,0,1136,1139,1,0,0,0,1137,1135,1,0,0,0,1137,1138,1,0,0,0,1138,119,
        1,0,0,0,1139,1137,1,0,0,0,1140,1142,5,83,0,0,1141,1143,5,133,0,0,
        1142,1141,1,0,0,0,1142,1143,1,0,0,0,1143,1145,1,0,0,0,1144,1140,
        1,0,0,0,1145,1148,1,0,0,0,1146,1144,1,0,0,0,1146,1147,1,0,0,0,1147,
        1149,1,0,0,0,1148,1146,1,0,0,0,1149,1150,3,122,61,0,1150,121,1,0,
        0,0,1151,1158,3,126,63,0,1152,1154,5,133,0,0,1153,1152,1,0,0,0,1153,
        1154,1,0,0,0,1154,1155,1,0,0,0,1155,1157,3,124,62,0,1156,1153,1,
        0,0,0,1157,1160,1,0,0,0,1158,1156,1,0,0,0,1158,1159,1,0,0,0,1159,
        123,1,0,0,0,1160,1158,1,0,0,0,1161,1163,5,9,0,0,1162,1164,5,133,
        0,0,1163,1162,1,0,0,0,1163,1164,1,0,0,0,1164,1165,1,0,0,0,1165,1192,
        3,126,63,0,1166,1168,5,16,0,0,1167,1169,5,133,0,0,1168,1167,1,0,
        0,0,1168,1169,1,0,0,0,1169,1170,1,0,0,0,1170,1192,3,126,63,0,1171,
        1173,5,17,0,0,1172,1174,5,133,0,0,1173,1172,1,0,0,0,1173,1174,1,
        0,0,0,1174,1175,1,0,0,0,1175,1192,3,126,63,0,1176,1178,5,18,0,0,
        1177,1179,5,133,0,0,1178,1177,1,0,0,0,1178,1179,1,0,0,0,1179,1180,
        1,0,0,0,1180,1192,3,126,63,0,1181,1183,5,19,0,0,1182,1184,5,133,
        0,0,1183,1182,1,0,0,0,1183,1184,1,0,0,0,1184,1185,1,0,0,0,1185,1192,
        3,126,63,0,1186,1188,5,20,0,0,1187,1189,5,133,0,0,1188,1187,1,0,
        0,0,1188,1189,1,0,0,0,1189,1190,1,0,0,0,1190,1192,3,126,63,0,1191,
        1161,1,0,0,0,1191,1166,1,0,0,0,1191,1171,1,0,0,0,1191,1176,1,0,0,
        0,1191,1181,1,0,0,0,1191,1186,1,0,0,0,1192,125,1,0,0,0,1193,1199,
        3,134,67,0,1194,1198,3,128,64,0,1195,1198,3,130,65,0,1196,1198,3,
        132,66,0,1197,1194,1,0,0,0,1197,1195,1,0,0,0,1197,1196,1,0,0,0,1198,
        1201,1,0,0,0,1199,1197,1,0,0,0,1199,1200,1,0,0,0,1200,127,1,0,0,
        0,1201,1199,1,0,0,0,1202,1203,5,133,0,0,1203,1204,5,84,0,0,1204,
        1205,5,133,0,0,1205,1217,5,66,0,0,1206,1207,5,133,0,0,1207,1208,
        5,85,0,0,1208,1209,5,133,0,0,1209,1217,5,66,0,0,1210,1211,5,133,
        0,0,1211,1217,5,86,0,0,1212,1214,5,133,0,0,1213,1212,1,0,0,0,1213,
        1214,1,0,0,0,1214,1215,1,0,0,0,1215,1217,5,21,0,0,1216,1202,1,0,
        0,0,1216,1206,1,0,0,0,1216,1210,1,0,0,0,1216,1213,1,0,0,0,1217,1219,
        1,0,0,0,1218,1220,5,133,0,0,1219,1218,1,0,0,0,1219,1220,1,0,0,0,
        1220,1221,1,0,0,0,1221,1222,3,134,67,0,1222,129,1,0,0,0,1223,1224,
        5,133,0,0,1224,1226,5,87,0,0,1225,1227,5,133,0,0,1226,1225,1,0,0,
        0,1226,1227,1,0,0,0,1227,1228,1,0,0,0,1228,1229,3,134,67,0,1229,
        131,1,0,0,0,1230,1231,5,133,0,0,1231,1232,5,88,0,0,1232,1233,5,133,
        0,0,1233,1241,5,89,0,0,1234,1235,5,133,0,0,1235,1236,5,88,0,0,1236,
        1237,5,133,0,0,1237,1238,5,83,0,0,1238,1239,5,133,0,0,1239,1241,
        5,89,0,0,1240,1230,1,0,0,0,1240,1234,1,0,0,0,1241,133,1,0,0,0,1242,
        1261,3,136,68,0,1243,1245,5,133,0,0,1244,1243,1,0,0,0,1244,1245,
        1,0,0,0,1245,1246,1,0,0,0,1246,1248,5,11,0,0,1247,1249,5,133,0,0,
        1248,1247,1,0,0,0,1248,1249,1,0,0,0,1249,1250,1,0,0,0,1250,1260,
        3,136,68,0,1251,1253,5,133,0,0,1252,1251,1,0,0,0,1252,1253,1,0,0,
        0,1253,1254,1,0,0,0,1254,1256,5,22,0,0,1255,1257,5,133,0,0,1256,
        1255,1,0,0,0,1256,1257,1,0,0,0,1257,1258,1,0,0,0,1258,1260,3,136,
        68,0,1259,1244,1,0,0,0,1259,1252,1,0,0,0,1260,1263,1,0,0,0,1261,
        1259,1,0,0,0,1261,1262,1,0,0,0,1262,135,1,0,0,0,1263,1261,1,0,0,
        0,1264,1291,3,138,69,0,1265,1267,5,133,0,0,1266,1265,1,0,0,0,1266,
        1267,1,0,0,0,1267,1268,1,0,0,0,1268,1270,5,5,0,0,1269,1271,5,133,
        0,0,1270,1269,1,0,0,0,1270,1271,1,0,0,0,1271,1272,1,0,0,0,1272,1290,
        3,138,69,0,1273,1275,5,133,0,0,1274,1273,1,0,0,0,1274,1275,1,0,0,
        0,1275,1276,1,0,0,0,1276,1278,5,23,0,0,1277,1279,5,133,0,0,1278,
        1277,1,0,0,0,1278,1279,1,0,0,0,1279,1280,1,0,0,0,1280,1290,3,138,
        69,0,1281,1283,5,133,0,0,1282,1281,1,0,0,0,1282,1283,1,0,0,0,1283,
        1284,1,0,0,0,1284,1286,5,24,0,0,1285,1287,5,133,0,0,1286,1285,1,
        0,0,0,1286,1287,1,0,0,0,1287,1288,1,0,0,0,1288,1290,3,138,69,0,1289,
        1266,1,0,0,0,1289,1274,1,0,0,0,1289,1282,1,0,0,0,1290,1293,1,0,0,
        0,1291,1289,1,0,0,0,1291,1292,1,0,0,0,1292,137,1,0,0,0,1293,1291,
        1,0,0,0,1294,1305,3,140,70,0,1295,1297,5,133,0,0,1296,1295,1,0,0,
        0,1296,1297,1,0,0,0,1297,1298,1,0,0,0,1298,1300,5,25,0,0,1299,1301,
        5,133,0,0,1300,1299,1,0,0,0,1300,1301,1,0,0,0,1301,1302,1,0,0,0,
        1302,1304,3,140,70,0,1303,1296,1,0,0,0,1304,1307,1,0,0,0,1305,1303,
        1,0,0,0,1305,1306,1,0,0,0,1306,139,1,0,0,0,1307,1305,1,0,0,0,1308,
        1315,3,142,71,0,1309,1311,7,2,0,0,1310,1312,5,133,0,0,1311,1310,
        1,0,0,0,1311,1312,1,0,0,0,1312,1313,1,0,0,0,1313,1315,3,142,71,0,
        1314,1308,1,0,0,0,1314,1309,1,0,0,0,1315,141,1,0,0,0,1316,1327,3,
        148,74,0,1317,1319,5,133,0,0,1318,1317,1,0,0,0,1318,1319,1,0,0,0,
        1319,1320,1,0,0,0,1320,1326,3,144,72,0,1321,1323,5,133,0,0,1322,
        1321,1,0,0,0,1322,1323,1,0,0,0,1323,1324,1,0,0,0,1324,1326,3,146,
        73,0,1325,1318,1,0,0,0,1325,1322,1,0,0,0,1326,1329,1,0,0,0,1327,
        1325,1,0,0,0,1327,1328,1,0,0,0,1328,1334,1,0,0,0,1329,1327,1,0,0,
        0,1330,1332,5,133,0,0,1331,1330,1,0,0,0,1331,1332,1,0,0,0,1332,1333,
        1,0,0,0,1333,1335,3,100,50,0,1334,1331,1,0,0,0,1334,1335,1,0,0,0,
        1335,143,1,0,0,0,1336,1337,5,12,0,0,1337,1338,3,112,56,0,1338,1339,
        5,13,0,0,1339,1350,1,0,0,0,1340,1342,5,12,0,0,1341,1343,3,112,56,
        0,1342,1341,1,0,0,0,1342,1343,1,0,0,0,1343,1344,1,0,0,0,1344,1346,
        5,15,0,0,1345,1347,3,112,56,0,1346,1345,1,0,0,0,1346,1347,1,0,0,
        0,1347,1348,1,0,0,0,1348,1350,5,13,0,0,1349,1336,1,0,0,0,1349,1340,
        1,0,0,0,1350,145,1,0,0,0,1351,1353,5,26,0,0,1352,1354,5,133,0,0,
        1353,1352,1,0,0,0,1353,1354,1,0,0,0,1354,1355,1,0,0,0,1355,1356,
        3,210,105,0,1356,147,1,0,0,0,1357,1385,3,196,98,0,1358,1385,3,212,
        106,0,1359,1385,3,156,78,0,1360,1385,3,180,90,0,1361,1363,5,91,0,
        0,1362,1364,5,133,0,0,1363,1362,1,0,0,0,1363,1364,1,0,0,0,1364,1365,
        1,0,0,0,1365,1367,5,2,0,0,1366,1368,5,133,0,0,1367,1366,1,0,0,0,
        1367,1368,1,0,0,0,1368,1369,1,0,0,0,1369,1371,5,5,0,0,1370,1372,
        5,133,0,0,1371,1370,1,0,0,0,1371,1372,1,0,0,0,1372,1373,1,0,0,0,
        1373,1385,5,4,0,0,1374,1385,3,160,80,0,1375,1385,3,162,81,0,1376,
        1385,3,164,82,0,1377,1385,3,150,75,0,1378,1385,3,168,84,0,1379,1385,
        3,170,85,0,1380,1385,3,174,87,0,1381,1385,3,178,89,0,1382,1385,3,
        152,76,0,1383,1385,3,194,97,0,1384,1357,1,0,0,0,1384,1358,1,0,0,
        0,1384,1359,1,0,0,0,1384,1360,1,0,0,0,1384,1361,1,0,0,0,1384,1374,
        1,0,0,0,1384,1375,1,0,0,0,1384,1376,1,0,0,0,1384,1377,1,0,0,0,1384,
        1378,1,0,0,0,1384,1379,1,0,0,0,1384,1380,1,0,0,0,1384,1381,1,0,0,
        0,1384,1382,1,0,0,0,1384,1383,1,0,0,0,1385,149,1,0,0,0,1386,1388,
        5,90,0,0,1387,1389,5,133,0,0,1388,1387,1,0,0,0,1388,1389,1,0,0,0,
        1389,1390,1,0,0,0,1390,1392,5,2,0,0,1391,1393,5,133,0,0,1392,1391,
        1,0,0,0,1392,1393,1,0,0,0,1393,1394,1,0,0,0,1394,1396,3,194,97,0,
        1395,1397,5,133,0,0,1396,1395,1,0,0,0,1396,1397,1,0,0,0,1397,1398,
        1,0,0,0,1398,1400,5,9,0,0,1399,1401,5,133,0,0,1400,1399,1,0,0,0,
        1400,1401,1,0,0,0,1401,1402,1,0,0,0,1402,1404,3,112,56,0,1403,1405,
        5,133,0,0,1404,1403,1,0,0,0,1404,1405,1,0,0,0,1405,1406,1,0,0,0,
        1406,1408,5,6,0,0,1407,1409,5,133,0,0,1408,1407,1,0,0,0,1408,1409,
        1,0,0,0,1409,1410,1,0,0,0,1410,1412,3,172,86,0,1411,1413,5,133,0,
        0,1412,1411,1,0,0,0,1412,1413,1,0,0,0,1413,1414,1,0,0,0,1414,1416,
        5,3,0,0,1415,1417,5,133,0,0,1416,1415,1,0,0,0,1416,1417,1,0,0,0,
        1417,1418,1,0,0,0,1418,1420,3,112,56,0,1419,1421,5,133,0,0,1420,
        1419,1,0,0,0,1420,1421,1,0,0,0,1421,1422,1,0,0,0,1422,1423,5,4,0,
        0,1423,151,1,0,0,0,1424,1426,3,194,97,0,1425,1427,5,133,0,0,1426,
        1425,1,0,0,0,1426,1427,1,0,0,0,1427,1428,1,0,0,0,1428,1430,5,7,0,
        0,1429,1431,5,133,0,0,1430,1429,1,0,0,0,1430,1431,1,0,0,0,1431,1449,
        1,0,0,0,1432,1434,3,154,77,0,1433,1435,5,133,0,0,1434,1433,1,0,0,
        0,1434,1435,1,0,0,0,1435,1446,1,0,0,0,1436,1438,5,6,0,0,1437,1439,
        5,133,0,0,1438,1437,1,0,0,0,1438,1439,1,0,0,0,1439,1440,1,0,0,0,
        1440,1442,3,154,77,0,1441,1443,5,133,0,0,1442,1441,1,0,0,0,1442,
        1443,1,0,0,0,1443,1445,1,0,0,0,1444,1436,1,0,0,0,1445,1448,1,0,0,
        0,1446,1444,1,0,0,0,1446,1447,1,0,0,0,1447,1450,1,0,0,0,1448,1446,
        1,0,0,0,1449,1432,1,0,0,0,1449,1450,1,0,0,0,1450,1451,1,0,0,0,1451,
        1452,5,8,0,0,1452,153,1,0,0,0,1453,1455,3,210,105,0,1454,1456,5,
        133,0,0,1455,1454,1,0,0,0,1455,1456,1,0,0,0,1456,1457,1,0,0,0,1457,
        1459,5,14,0,0,1458,1460,5,133,0,0,1459,1458,1,0,0,0,1459,1460,1,
        0,0,0,1460,1461,1,0,0,0,1461,1462,3,112,56,0,1462,1475,1,0,0,0,1463,
        1465,5,26,0,0,1464,1466,5,133,0,0,1465,1464,1,0,0,0,1465,1466,1,
        0,0,0,1466,1467,1,0,0,0,1467,1475,3,210,105,0,1468,1470,5,26,0,0,
        1469,1471,5,133,0,0,1470,1469,1,0,0,0,1470,1471,1,0,0,0,1471,1472,
        1,0,0,0,1472,1475,5,5,0,0,1473,1475,3,194,97,0,1474,1453,1,0,0,0,
        1474,1463,1,0,0,0,1474,1468,1,0,0,0,1474,1473,1,0,0,0,1475,155,1,
        0,0,0,1476,1481,5,92,0,0,1477,1479,5,133,0,0,1478,1477,1,0,0,0,1478,
        1479,1,0,0,0,1479,1480,1,0,0,0,1480,1482,3,158,79,0,1481,1478,1,
        0,0,0,1482,1483,1,0,0,0,1483,1481,1,0,0,0,1483,1484,1,0,0,0,1484,
        1499,1,0,0,0,1485,1487,5,92,0,0,1486,1488,5,133,0,0,1487,1486,1,
        0,0,0,1487,1488,1,0,0,0,1488,1489,1,0,0,0,1489,1494,3,112,56,0,1490,
        1492,5,133,0,0,1491,1490,1,0,0,0,1491,1492,1,0,0,0,1492,1493,1,0,
        0,0,1493,1495,3,158,79,0,1494,1491,1,0,0,0,1495,1496,1,0,0,0,1496,
        1494,1,0,0,0,1496,1497,1,0,0,0,1497,1499,1,0,0,0,1498,1476,1,0,0,
        0,1498,1485,1,0,0,0,1499,1508,1,0,0,0,1500,1502,5,133,0,0,1501,1500,
        1,0,0,0,1501,1502,1,0,0,0,1502,1503,1,0,0,0,1503,1505,5,93,0,0,1504,
        1506,5,133,0,0,1505,1504,1,0,0,0,1505,1506,1,0,0,0,1506,1507,1,0,
        0,0,1507,1509,3,112,56,0,1508,1501,1,0,0,0,1508,1509,1,0,0,0,1509,
        1511,1,0,0,0,1510,1512,5,133,0,0,1511,1510,1,0,0,0,1511,1512,1,0,
        0,0,1512,1513,1,0,0,0,1513,1514,5,94,0,0,1514,157,1,0,0,0,1515,1517,
        5,95,0,0,1516,1518,5,133,0,0,1517,1516,1,0,0,0,1517,1518,1,0,0,0,
        1518,1519,1,0,0,0,1519,1521,3,112,56,0,1520,1522,5,133,0,0,1521,
        1520,1,0,0,0,1521,1522,1,0,0,0,1522,1523,1,0,0,0,1523,1525,5,96,
        0,0,1524,1526,5,133,0,0,1525,1524,1,0,0,0,1525,1526,1,0,0,0,1526,
        1527,1,0,0,0,1527,1528,3,112,56,0,1528,159,1,0,0,0,1529,1531,5,12,
        0,0,1530,1532,5,133,0,0,1531,1530,1,0,0,0,1531,1532,1,0,0,0,1532,
        1533,1,0,0,0,1533,1542,3,166,83,0,1534,1536,5,133,0,0,1535,1534,
        1,0,0,0,1535,1536,1,0,0,0,1536,1537,1,0,0,0,1537,1539,5,3,0,0,1538,
        1540,5,133,0,0,1539,1538,1,0,0,0,1539,1540,1,0,0,0,1540,1541,1,0,
        0,0,1541,1543,3,112,56,0,1542,1535,1,0,0,0,1542,1543,1,0,0,0,1543,
        1545,1,0,0,0,1544,1546,5,133,0,0,1545,1544,1,0,0,0,1545,1546,1,0,
        0,0,1546,1547,1,0,0,0,1547,1548,5,13,0,0,1548,161,1,0,0,0,1549,1551,
        5,12,0,0,1550,1552,5,133,0,0,1551,1550,1,0,0,0,1551,1552,1,0,0,0,
        1552,1561,1,0,0,0,1553,1555,3,194,97,0,1554,1556,5,133,0,0,1555,
        1554,1,0,0,0,1555,1556,1,0,0,0,1556,1557,1,0,0,0,1557,1559,5,9,0,
        0,1558,1560,5,133,0,0,1559,1558,1,0,0,0,1559,1560,1,0,0,0,1560,1562,
        1,0,0,0,1561,1553,1,0,0,0,1561,1562,1,0,0,0,1562,1563,1,0,0,0,1563,
        1565,3,84,42,0,1564,1566,5,133,0,0,1565,1564,1,0,0,0,1565,1566,1,
        0,0,0,1566,1571,1,0,0,0,1567,1569,3,70,35,0,1568,1570,5,133,0,0,
        1569,1568,1,0,0,0,1569,1570,1,0,0,0,1570,1572,1,0,0,0,1571,1567,
        1,0,0,0,1571,1572,1,0,0,0,1572,1573,1,0,0,0,1573,1575,5,3,0,0,1574,
        1576,5,133,0,0,1575,1574,1,0,0,0,1575,1576,1,0,0,0,1576,1577,1,0,
        0,0,1577,1579,3,112,56,0,1578,1580,5,133,0,0,1579,1578,1,0,0,0,1579,
        1580,1,0,0,0,1580,1581,1,0,0,0,1581,1582,5,13,0,0,1582,163,1,0,0,
        0,1583,1585,5,48,0,0,1584,1586,5,133,0,0,1585,1584,1,0,0,0,1585,
        1586,1,0,0,0,1586,1587,1,0,0,0,1587,1589,5,2,0,0,1588,1590,5,133,
        0,0,1589,1588,1,0,0,0,1589,1590,1,0,0,0,1590,1591,1,0,0,0,1591,1593,
        3,166,83,0,1592,1594,5,133,0,0,1593,1592,1,0,0,0,1593,1594,1,0,0,
        0,1594,1595,1,0,0,0,1595,1596,5,4,0,0,1596,1640,1,0,0,0,1597,1599,
        5,97,0,0,1598,1600,5,133,0,0,1599,1598,1,0,0,0,1599,1600,1,0,0,0,
        1600,1601,1,0,0,0,1601,1603,5,2,0,0,1602,1604,5,133,0,0,1603,1602,
        1,0,0,0,1603,1604,1,0,0,0,1604,1605,1,0,0,0,1605,1607,3,166,83,0,
        1606,1608,5,133,0,0,1607,1606,1,0,0,0,1607,1608,1,0,0,0,1608,1609,
        1,0,0,0,1609,1610,5,4,0,0,1610,1640,1,0,0,0,1611,1613,5,98,0,0,1612,
        1614,5,133,0,0,1613,1612,1,0,0,0,1613,1614,1,0,0,0,1614,1615,1,0,
        0,0,1615,1617,5,2,0,0,1616,1618,5,133,0,0,1617,1616,1,0,0,0,1617,
        1618,1,0,0,0,1618,1619,1,0,0,0,1619,1621,3,166,83,0,1620,1622,5,
        133,0,0,1621,1620,1,0,0,0,1621,1622,1,0,0,0,1622,1623,1,0,0,0,1623,
        1624,5,4,0,0,1624,1640,1,0,0,0,1625,1627,5,99,0,0,1626,1628,5,133,
        0,0,1627,1626,1,0,0,0,1627,1628,1,0,0,0,1628,1629,1,0,0,0,1629,1631,
        5,2,0,0,1630,1632,5,133,0,0,1631,1630,1,0,0,0,1631,1632,1,0,0,0,
        1632,1633,1,0,0,0,1633,1635,3,166,83,0,1634,1636,5,133,0,0,1635,
        1634,1,0,0,0,1635,1636,1,0,0,0,1636,1637,1,0,0,0,1637,1638,5,4,0,
        0,1638,1640,1,0,0,0,1639,1583,1,0,0,0,1639,1597,1,0,0,0,1639,1611,
        1,0,0,0,1639,1625,1,0,0,0,1640,165,1,0,0,0,1641,1646,3,172,86,0,
        1642,1644,5,133,0,0,1643,1642,1,0,0,0,1643,1644,1,0,0,0,1644,1645,
        1,0,0,0,1645,1647,3,70,35,0,1646,1643,1,0,0,0,1646,1647,1,0,0,0,
        1647,167,1,0,0,0,1648,1649,3,84,42,0,1649,169,1,0,0,0,1650,1652,
        5,2,0,0,1651,1653,5,133,0,0,1652,1651,1,0,0,0,1652,1653,1,0,0,0,
        1653,1654,1,0,0,0,1654,1656,3,112,56,0,1655,1657,5,133,0,0,1656,
        1655,1,0,0,0,1656,1657,1,0,0,0,1657,1658,1,0,0,0,1658,1659,5,4,0,
        0,1659,171,1,0,0,0,1660,1661,3,194,97,0,1661,1662,5,133,0,0,1662,
        1663,5,87,0,0,1663,1664,5,133,0,0,1664,1665,3,112,56,0,1665,173,
        1,0,0,0,1666,1668,3,176,88,0,1667,1669,5,133,0,0,1668,1667,1,0,0,
        0,1668,1669,1,0,0,0,1669,1670,1,0,0,0,1670,1672,5,2,0,0,1671,1673,
        5,133,0,0,1672,1671,1,0,0,0,1672,1673,1,0,0,0,1673,1678,1,0,0,0,
        1674,1676,5,68,0,0,1675,1677,5,133,0,0,1676,1675,1,0,0,0,1676,1677,
        1,0,0,0,1677,1679,1,0,0,0,1678,1674,1,0,0,0,1678,1679,1,0,0,0,1679,
        1697,1,0,0,0,1680,1682,3,112,56,0,1681,1683,5,133,0,0,1682,1681,
        1,0,0,0,1682,1683,1,0,0,0,1683,1694,1,0,0,0,1684,1686,5,6,0,0,1685,
        1687,5,133,0,0,1686,1685,1,0,0,0,1686,1687,1,0,0,0,1687,1688,1,0,
        0,0,1688,1690,3,112,56,0,1689,1691,5,133,0,0,1690,1689,1,0,0,0,1690,
        1691,1,0,0,0,1691,1693,1,0,0,0,1692,1684,1,0,0,0,1693,1696,1,0,0,
        0,1694,1692,1,0,0,0,1694,1695,1,0,0,0,1695,1698,1,0,0,0,1696,1694,
        1,0,0,0,1697,1680,1,0,0,0,1697,1698,1,0,0,0,1698,1699,1,0,0,0,1699,
        1700,5,4,0,0,1700,175,1,0,0,0,1701,1702,3,192,96,0,1702,1703,3,218,
        109,0,1703,177,1,0,0,0,1704,1706,5,100,0,0,1705,1707,5,133,0,0,1706,
        1705,1,0,0,0,1706,1707,1,0,0,0,1707,1708,1,0,0,0,1708,1710,5,7,0,
        0,1709,1711,5,133,0,0,1710,1709,1,0,0,0,1710,1711,1,0,0,0,1711,1721,
        1,0,0,0,1712,1722,3,6,3,0,1713,1722,3,182,91,0,1714,1719,3,72,36,
        0,1715,1717,5,133,0,0,1716,1715,1,0,0,0,1716,1717,1,0,0,0,1717,1718,
        1,0,0,0,1718,1720,3,70,35,0,1719,1716,1,0,0,0,1719,1720,1,0,0,0,
        1720,1722,1,0,0,0,1721,1712,1,0,0,0,1721,1713,1,0,0,0,1721,1714,
        1,0,0,0,1722,1724,1,0,0,0,1723,1725,5,133,0,0,1724,1723,1,0,0,0,
        1724,1725,1,0,0,0,1725,1726,1,0,0,0,1726,1727,5,8,0,0,1727,179,1,
        0,0,0,1728,1730,5,91,0,0,1729,1731,5,133,0,0,1730,1729,1,0,0,0,1730,
        1731,1,0,0,0,1731,1732,1,0,0,0,1732,1734,5,7,0,0,1733,1735,5,133,
        0,0,1734,1733,1,0,0,0,1734,1735,1,0,0,0,1735,1745,1,0,0,0,1736,1746,
        3,6,3,0,1737,1746,3,182,91,0,1738,1743,3,72,36,0,1739,1741,5,133,
        0,0,1740,1739,1,0,0,0,1740,1741,1,0,0,0,1741,1742,1,0,0,0,1742,1744,
        3,70,35,0,1743,1740,1,0,0,0,1743,1744,1,0,0,0,1744,1746,1,0,0,0,
        1745,1736,1,0,0,0,1745,1737,1,0,0,0,1745,1738,1,0,0,0,1746,1748,
        1,0,0,0,1747,1749,5,133,0,0,1748,1747,1,0,0,0,1748,1749,1,0,0,0,
        1749,1750,1,0,0,0,1750,1751,5,8,0,0,1751,181,1,0,0,0,1752,1759,3,
        20,10,0,1753,1755,5,133,0,0,1754,1753,1,0,0,0,1754,1755,1,0,0,0,
        1755,1756,1,0,0,0,1756,1758,3,20,10,0,1757,1754,1,0,0,0,1758,1761,
        1,0,0,0,1759,1757,1,0,0,0,1759,1760,1,0,0,0,1760,183,1,0,0,0,1761,
        1759,1,0,0,0,1762,1764,3,190,95,0,1763,1765,5,133,0,0,1764,1763,
        1,0,0,0,1764,1765,1,0,0,0,1765,1766,1,0,0,0,1766,1768,5,2,0,0,1767,
        1769,5,133,0,0,1768,1767,1,0,0,0,1768,1769,1,0,0,0,1769,1787,1,0,
        0,0,1770,1772,3,112,56,0,1771,1773,5,133,0,0,1772,1771,1,0,0,0,1772,
        1773,1,0,0,0,1773,1784,1,0,0,0,1774,1776,5,6,0,0,1775,1777,5,133,
        0,0,1776,1775,1,0,0,0,1776,1777,1,0,0,0,1777,1778,1,0,0,0,1778,1780,
        3,112,56,0,1779,1781,5,133,0,0,1780,1779,1,0,0,0,1780,1781,1,0,0,
        0,1781,1783,1,0,0,0,1782,1774,1,0,0,0,1783,1786,1,0,0,0,1784,1782,
        1,0,0,0,1784,1785,1,0,0,0,1785,1788,1,0,0,0,1786,1784,1,0,0,0,1787,
        1770,1,0,0,0,1787,1788,1,0,0,0,1788,1789,1,0,0,0,1789,1790,5,4,0,
        0,1790,185,1,0,0,0,1791,1792,3,190,95,0,1792,187,1,0,0,0,1793,1794,
        3,218,109,0,1794,189,1,0,0,0,1795,1796,3,192,96,0,1796,1797,3,218,
        109,0,1797,191,1,0,0,0,1798,1799,3,218,109,0,1799,1800,5,26,0,0,
        1800,1802,1,0,0,0,1801,1798,1,0,0,0,1802,1805,1,0,0,0,1803,1801,
        1,0,0,0,1803,1804,1,0,0,0,1804,193,1,0,0,0,1805,1803,1,0,0,0,1806,
        1807,3,218,109,0,1807,195,1,0,0,0,1808,1815,3,198,99,0,1809,1815,
        5,89,0,0,1810,1815,3,200,100,0,1811,1815,5,115,0,0,1812,1815,3,206,
        103,0,1813,1815,3,208,104,0,1814,1808,1,0,0,0,1814,1809,1,0,0,0,
        1814,1810,1,0,0,0,1814,1811,1,0,0,0,1814,1812,1,0,0,0,1814,1813,
        1,0,0,0,1815,197,1,0,0,0,1816,1817,7,3,0,0,1817,199,1,0,0,0,1818,
        1821,3,204,102,0,1819,1821,3,202,101,0,1820,1818,1,0,0,0,1820,1819,
        1,0,0,0,1821,201,1,0,0,0,1822,1823,7,4,0,0,1823,203,1,0,0,0,1824,
        1825,7,5,0,0,1825,205,1,0,0,0,1826,1828,5,12,0,0,1827,1829,5,133,
        0,0,1828,1827,1,0,0,0,1828,1829,1,0,0,0,1829,1847,1,0,0,0,1830,1832,
        3,112,56,0,1831,1833,5,133,0,0,1832,1831,1,0,0,0,1832,1833,1,0,0,
        0,1833,1844,1,0,0,0,1834,1836,5,6,0,0,1835,1837,5,133,0,0,1836,1835,
        1,0,0,0,1836,1837,1,0,0,0,1837,1838,1,0,0,0,1838,1840,3,112,56,0,
        1839,1841,5,133,0,0,1840,1839,1,0,0,0,1840,1841,1,0,0,0,1841,1843,
        1,0,0,0,1842,1834,1,0,0,0,1843,1846,1,0,0,0,1844,1842,1,0,0,0,1844,
        1845,1,0,0,0,1845,1848,1,0,0,0,1846,1844,1,0,0,0,1847,1830,1,0,0,
        0,1847,1848,1,0,0,0,1848,1849,1,0,0,0,1849,1850,5,13,0,0,1850,207,
        1,0,0,0,1851,1853,5,7,0,0,1852,1854,5,133,0,0,1853,1852,1,0,0,0,
        1853,1854,1,0,0,0,1854,1888,1,0,0,0,1855,1857,3,210,105,0,1856,1858,
        5,133,0,0,1857,1856,1,0,0,0,1857,1858,1,0,0,0,1858,1859,1,0,0,0,
        1859,1861,5,14,0,0,1860,1862,5,133,0,0,1861,1860,1,0,0,0,1861,1862,
        1,0,0,0,1862,1863,1,0,0,0,1863,1865,3,112,56,0,1864,1866,5,133,0,
        0,1865,1864,1,0,0,0,1865,1866,1,0,0,0,1866,1885,1,0,0,0,1867,1869,
        5,6,0,0,1868,1870,5,133,0,0,1869,1868,1,0,0,0,1869,1870,1,0,0,0,
        1870,1871,1,0,0,0,1871,1873,3,210,105,0,1872,1874,5,133,0,0,1873,
        1872,1,0,0,0,1873,1874,1,0,0,0,1874,1875,1,0,0,0,1875,1877,5,14,
        0,0,1876,1878,5,133,0,0,1877,1876,1,0,0,0,1877,1878,1,0,0,0,1878,
        1879,1,0,0,0,1879,1881,3,112,56,0,1880,1882,5,133,0,0,1881,1880,
        1,0,0,0,1881,1882,1,0,0,0,1882,1884,1,0,0,0,1883,1867,1,0,0,0,1884,
        1887,1,0,0,0,1885,1883,1,0,0,0,1885,1886,1,0,0,0,1886,1889,1,0,0,
        0,1887,1885,1,0,0,0,1888,1855,1,0,0,0,1888,1889,1,0,0,0,1889,1890,
        1,0,0,0,1890,1891,5,8,0,0,1891,209,1,0,0,0,1892,1893,3,214,107,0,
        1893,211,1,0,0,0,1894,1897,5,27,0,0,1895,1898,3,218,109,0,1896,1898,
        5,104,0,0,1897,1895,1,0,0,0,1897,1896,1,0,0,0,1898,213,1,0,0,0,1899,
        1902,3,218,109,0,1900,1902,3,216,108,0,1901,1899,1,0,0,0,1901,1900,
        1,0,0,0,1902,215,1,0,0,0,1903,1904,7,6,0,0,1904,217,1,0,0,0,1905,
        1906,7,7,0,0,1906,219,1,0,0,0,1907,1908,7,8,0,0,1908,221,1,0,0,0,
        1909,1910,7,9,0,0,1910,223,1,0,0,0,1911,1912,7,10,0,0,1912,225,1,
        0,0,0,366,227,231,234,237,245,249,254,261,266,269,273,277,281,287,
        291,296,301,305,308,310,314,318,323,327,332,336,347,351,355,363,
        367,372,375,383,387,391,395,400,404,409,412,415,419,421,425,429,
        443,445,449,453,457,460,464,474,481,494,498,504,508,512,517,522,
        526,532,536,542,546,552,556,560,564,568,572,577,584,588,593,600,
        606,611,617,620,626,628,632,636,641,645,648,655,662,665,671,674,
        680,684,688,692,696,701,706,710,715,718,727,736,741,754,757,765,
        769,774,779,783,788,792,796,800,804,810,814,818,822,826,829,834,
        838,845,849,853,856,859,863,869,874,878,882,884,888,890,894,896,
        902,905,908,916,919,922,926,929,932,934,937,941,945,948,951,955,
        961,965,968,971,977,980,983,987,993,996,999,1003,1007,1011,1013,
        1017,1019,1022,1026,1028,1034,1038,1042,1046,1049,1054,1059,1064,
        1069,1075,1079,1081,1085,1089,1091,1093,1101,1106,1117,1127,1137,
        1142,1146,1153,1158,1163,1168,1173,1178,1183,1188,1191,1197,1199,
        1213,1216,1219,1226,1240,1244,1248,1252,1256,1259,1261,1266,1270,
        1274,1278,1282,1286,1289,1291,1296,1300,1305,1311,1314,1318,1322,
        1325,1327,1331,1334,1342,1346,1349,1353,1363,1367,1371,1384,1388,
        1392,1396,1400,1404,1408,1412,1416,1420,1426,1430,1434,1438,1442,
        1446,1449,1455,1459,1465,1470,1474,1478,1483,1487,1491,1496,1498,
        1501,1505,1508,1511,1517,1521,1525,1531,1535,1539,1542,1545,1551,
        1555,1559,1561,1565,1569,1571,1575,1579,1585,1589,1593,1599,1603,
        1607,1613,1617,1621,1627,1631,1635,1639,1643,1646,1652,1656,1668,
        1672,1676,1678,1682,1686,1690,1694,1697,1706,1710,1716,1719,1721,
        1724,1730,1734,1740,1743,1745,1748,1754,1759,1764,1768,1772,1776,
        1780,1784,1787,1803,1814,1820,1828,1832,1836,1840,1844,1847,1853,
        1857,1861,1865,1869,1873,1877,1881,1885,1888,1897,1901
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
    public oC_SymbolicName(): OC_SymbolicNameContext {
        return this.getRuleContext(0, OC_SymbolicNameContext)!;
    }
    public override get ruleIndex(): number {
        return CypherParser.RULE_oC_Variable;
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
    public oC_SymbolicName(): OC_SymbolicNameContext | null {
        return this.getRuleContext(0, OC_SymbolicNameContext);
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
