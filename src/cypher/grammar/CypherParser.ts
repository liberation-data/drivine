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
    public static readonly RULE_oC_RelationshipsPattern = 41;
    public static readonly RULE_oC_NodePattern = 42;
    public static readonly RULE_oC_PatternElementChain = 43;
    public static readonly RULE_oC_PathQuantifier = 44;
    public static readonly RULE_oC_RelationshipPattern = 45;
    public static readonly RULE_oC_RelationshipDetail = 46;
    public static readonly RULE_oC_Properties = 47;
    public static readonly RULE_oC_RelationshipTypes = 48;
    public static readonly RULE_oC_NodeLabels = 49;
    public static readonly RULE_oC_NodeLabel = 50;
    public static readonly RULE_oC_RangeLiteral = 51;
    public static readonly RULE_oC_LabelName = 52;
    public static readonly RULE_oC_RelTypeName = 53;
    public static readonly RULE_oC_PropertyExpression = 54;
    public static readonly RULE_oC_Expression = 55;
    public static readonly RULE_oC_OrExpression = 56;
    public static readonly RULE_oC_XorExpression = 57;
    public static readonly RULE_oC_AndExpression = 58;
    public static readonly RULE_oC_NotExpression = 59;
    public static readonly RULE_oC_ComparisonExpression = 60;
    public static readonly RULE_oC_PartialComparisonExpression = 61;
    public static readonly RULE_oC_StringListNullPredicateExpression = 62;
    public static readonly RULE_oC_StringPredicateExpression = 63;
    public static readonly RULE_oC_ListPredicateExpression = 64;
    public static readonly RULE_oC_NullPredicateExpression = 65;
    public static readonly RULE_oC_AddOrSubtractExpression = 66;
    public static readonly RULE_oC_MultiplyDivideModuloExpression = 67;
    public static readonly RULE_oC_PowerOfExpression = 68;
    public static readonly RULE_oC_UnaryAddOrSubtractExpression = 69;
    public static readonly RULE_oC_NonArithmeticOperatorExpression = 70;
    public static readonly RULE_oC_ListOperatorExpression = 71;
    public static readonly RULE_oC_PropertyLookup = 72;
    public static readonly RULE_oC_Atom = 73;
    public static readonly RULE_oC_Reduce = 74;
    public static readonly RULE_oC_MapProjection = 75;
    public static readonly RULE_oC_MapProjectionElement = 76;
    public static readonly RULE_oC_CaseExpression = 77;
    public static readonly RULE_oC_CaseAlternative = 78;
    public static readonly RULE_oC_ListComprehension = 79;
    public static readonly RULE_oC_PatternComprehension = 80;
    public static readonly RULE_oC_Quantifier = 81;
    public static readonly RULE_oC_FilterExpression = 82;
    public static readonly RULE_oC_PatternPredicate = 83;
    public static readonly RULE_oC_ParenthesizedExpression = 84;
    public static readonly RULE_oC_IdInColl = 85;
    public static readonly RULE_oC_FunctionInvocation = 86;
    public static readonly RULE_oC_FunctionName = 87;
    public static readonly RULE_oC_ExistentialSubquery = 88;
    public static readonly RULE_oC_CountSubquery = 89;
    public static readonly RULE_oC_SubqueryReadings = 90;
    public static readonly RULE_oC_ExplicitProcedureInvocation = 91;
    public static readonly RULE_oC_ImplicitProcedureInvocation = 92;
    public static readonly RULE_oC_ProcedureResultField = 93;
    public static readonly RULE_oC_ProcedureName = 94;
    public static readonly RULE_oC_Namespace = 95;
    public static readonly RULE_oC_Variable = 96;
    public static readonly RULE_oC_Literal = 97;
    public static readonly RULE_oC_BooleanLiteral = 98;
    public static readonly RULE_oC_NumberLiteral = 99;
    public static readonly RULE_oC_IntegerLiteral = 100;
    public static readonly RULE_oC_DoubleLiteral = 101;
    public static readonly RULE_oC_ListLiteral = 102;
    public static readonly RULE_oC_MapLiteral = 103;
    public static readonly RULE_oC_PropertyKeyName = 104;
    public static readonly RULE_oC_Parameter = 105;
    public static readonly RULE_oC_SchemaName = 106;
    public static readonly RULE_oC_ReservedWord = 107;
    public static readonly RULE_oC_SymbolicName = 108;
    public static readonly RULE_oC_LeftArrowHead = 109;
    public static readonly RULE_oC_RightArrowHead = 110;
    public static readonly RULE_oC_Dash = 111;

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
        "oC_PatternElement", "oC_RelationshipsPattern", "oC_NodePattern", 
        "oC_PatternElementChain", "oC_PathQuantifier", "oC_RelationshipPattern", 
        "oC_RelationshipDetail", "oC_Properties", "oC_RelationshipTypes", 
        "oC_NodeLabels", "oC_NodeLabel", "oC_RangeLiteral", "oC_LabelName", 
        "oC_RelTypeName", "oC_PropertyExpression", "oC_Expression", "oC_OrExpression", 
        "oC_XorExpression", "oC_AndExpression", "oC_NotExpression", "oC_ComparisonExpression", 
        "oC_PartialComparisonExpression", "oC_StringListNullPredicateExpression", 
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
            this.state = 225;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 224;
                this.match(CypherParser.SP);
                }
            }

            this.state = 227;
            this.oC_Statement();
            this.state = 232;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 2, this.context) ) {
            case 1:
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
                this.match(CypherParser.T__0);
                }
                break;
            }
            this.state = 235;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 234;
                this.match(CypherParser.SP);
                }
            }

            this.state = 237;
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
            this.state = 239;
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
            this.state = 243;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 4, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 241;
                this.oC_RegularQuery();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 242;
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
            this.state = 245;
            this.oC_SingleQuery();
            this.state = 252;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 6, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 247;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 246;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 249;
                    this.oC_Union();
                    }
                    }
                }
                this.state = 254;
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
            this.state = 267;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 9, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 255;
                this.match(CypherParser.UNION);
                this.state = 256;
                this.match(CypherParser.SP);
                this.state = 257;
                this.match(CypherParser.ALL);
                this.state = 259;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 258;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 261;
                this.oC_SingleQuery();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 262;
                this.match(CypherParser.UNION);
                this.state = 264;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 263;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 266;
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
            this.state = 271;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 10, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 269;
                this.oC_SinglePartQuery();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 270;
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
            this.state = 308;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 19, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 279;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (((((_la - 53)) & ~0x1F) === 0 && ((1 << (_la - 53)) & 2055) !== 0)) {
                    {
                    {
                    this.state = 273;
                    this.oC_ReadingClause();
                    this.state = 275;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 274;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 281;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 282;
                this.oC_Return();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 289;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 14, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 283;
                        this.oC_ReadingClause();
                        this.state = 285;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 284;
                            this.match(CypherParser.SP);
                            }
                        }

                        }
                        }
                    }
                    this.state = 291;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 14, this.context);
                }
                this.state = 292;
                this.oC_UpdatingClause();
                this.state = 299;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 16, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 294;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 293;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 296;
                        this.oC_UpdatingClause();
                        }
                        }
                    }
                    this.state = 301;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 16, this.context);
                }
                this.state = 306;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 18, this.context) ) {
                case 1:
                    {
                    this.state = 303;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 302;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 305;
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
            this.state = 332;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
                    this.state = 316;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 21, this.context);
                    while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                        if (alternative === 1) {
                            {
                            {
                            this.state = 310;
                            this.oC_ReadingClause();
                            this.state = 312;
                            this.errorHandler.sync(this);
                            _la = this.tokenStream.LA(1);
                            if (_la === 133) {
                                {
                                this.state = 311;
                                this.match(CypherParser.SP);
                                }
                            }

                            }
                            }
                        }
                        this.state = 318;
                        this.errorHandler.sync(this);
                        alternative = this.interpreter.adaptivePredict(this.tokenStream, 21, this.context);
                    }
                    this.state = 325;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (((((_la - 49)) & ~0x1F) === 0 && ((1 << (_la - 49)) & 64785) !== 0)) {
                        {
                        {
                        this.state = 319;
                        this.oC_UpdatingClause();
                        this.state = 321;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 320;
                            this.match(CypherParser.SP);
                            }
                        }

                        }
                        }
                        this.state = 327;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 328;
                    this.oC_With();
                    this.state = 330;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 329;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 334;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 25, this.context);
            } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
            this.state = 336;
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
            this.state = 345;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.CREATE:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 338;
                this.oC_Create();
                }
                break;
            case CypherParser.MERGE:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 339;
                this.oC_Merge();
                }
                break;
            case CypherParser.DETACH:
            case CypherParser.DELETE:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 340;
                this.oC_Delete();
                }
                break;
            case CypherParser.SET:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 341;
                this.oC_Set();
                }
                break;
            case CypherParser.REMOVE:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 342;
                this.oC_Remove();
                }
                break;
            case CypherParser.FOREACH:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 343;
                this.oC_Foreach();
                }
                break;
            case CypherParser.OPTIONAL:
            case CypherParser.CALL:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 344;
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
            this.state = 347;
            this.match(CypherParser.FOREACH);
            this.state = 349;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 348;
                this.match(CypherParser.SP);
                }
            }

            this.state = 351;
            this.match(CypherParser.T__1);
            this.state = 353;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 352;
                this.match(CypherParser.SP);
                }
            }

            this.state = 355;
            this.oC_Variable();
            this.state = 356;
            this.match(CypherParser.SP);
            this.state = 357;
            this.match(CypherParser.IN);
            this.state = 358;
            this.match(CypherParser.SP);
            this.state = 359;
            this.oC_Expression();
            this.state = 361;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 360;
                this.match(CypherParser.SP);
                }
            }

            this.state = 363;
            this.match(CypherParser.T__2);
            this.state = 368;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
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
                    this.oC_UpdatingClause();
                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 370;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 31, this.context);
            } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
            this.state = 373;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 372;
                this.match(CypherParser.SP);
                }
            }

            this.state = 375;
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
            this.state = 381;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 33, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 377;
                this.oC_Match();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 378;
                this.oC_Unwind();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 379;
                this.oC_SubqueryCall();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 380;
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
            this.state = 385;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 53) {
                {
                this.state = 383;
                this.match(CypherParser.OPTIONAL);
                this.state = 384;
                this.match(CypherParser.SP);
                }
            }

            this.state = 387;
            this.match(CypherParser.CALL);
            this.state = 389;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 388;
                this.match(CypherParser.SP);
                }
            }

            this.state = 419;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 2) {
                {
                this.state = 391;
                this.match(CypherParser.T__1);
                this.state = 393;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 36, this.context) ) {
                case 1:
                    {
                    this.state = 392;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 410;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case CypherParser.T__4:
                    {
                    this.state = 395;
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
                    this.state = 396;
                    this.oC_Variable();
                    this.state = 407;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 39, this.context);
                    while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                        if (alternative === 1) {
                            {
                            {
                            this.state = 398;
                            this.errorHandler.sync(this);
                            _la = this.tokenStream.LA(1);
                            if (_la === 133) {
                                {
                                this.state = 397;
                                this.match(CypherParser.SP);
                                }
                            }

                            this.state = 400;
                            this.match(CypherParser.T__5);
                            this.state = 402;
                            this.errorHandler.sync(this);
                            _la = this.tokenStream.LA(1);
                            if (_la === 133) {
                                {
                                this.state = 401;
                                this.match(CypherParser.SP);
                                }
                            }

                            this.state = 404;
                            this.oC_Variable();
                            }
                            }
                        }
                        this.state = 409;
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
                this.state = 413;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 412;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 415;
                this.match(CypherParser.T__3);
                this.state = 417;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 416;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 421;
            this.match(CypherParser.T__6);
            this.state = 423;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 422;
                this.match(CypherParser.SP);
                }
            }

            this.state = 425;
            this.oC_RegularQuery();
            this.state = 427;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 426;
                this.match(CypherParser.SP);
                }
            }

            this.state = 429;
            this.match(CypherParser.T__7);
            this.state = 443;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 47, this.context) ) {
            case 1:
                {
                this.state = 430;
                this.match(CypherParser.SP);
                this.state = 431;
                this.match(CypherParser.IN);
                this.state = 432;
                this.match(CypherParser.SP);
                this.state = 433;
                this.match(CypherParser.TRANSACTIONS);
                this.state = 441;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 46, this.context) ) {
                case 1:
                    {
                    this.state = 434;
                    this.match(CypherParser.SP);
                    this.state = 435;
                    this.match(CypherParser.OF);
                    this.state = 436;
                    this.match(CypherParser.SP);
                    this.state = 437;
                    this.oC_Expression();
                    this.state = 438;
                    this.match(CypherParser.SP);
                    this.state = 439;
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
            this.state = 447;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 53) {
                {
                this.state = 445;
                this.match(CypherParser.OPTIONAL);
                this.state = 446;
                this.match(CypherParser.SP);
                }
            }

            this.state = 449;
            this.match(CypherParser.MATCH);
            this.state = 451;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 450;
                this.match(CypherParser.SP);
                }
            }

            this.state = 453;
            this.oC_Pattern();
            this.state = 458;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 51, this.context) ) {
            case 1:
                {
                this.state = 455;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 454;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 457;
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
            this.state = 460;
            this.match(CypherParser.UNWIND);
            this.state = 462;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 461;
                this.match(CypherParser.SP);
                }
            }

            this.state = 464;
            this.oC_Expression();
            this.state = 465;
            this.match(CypherParser.SP);
            this.state = 466;
            this.match(CypherParser.AS);
            this.state = 467;
            this.match(CypherParser.SP);
            this.state = 468;
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
            this.state = 470;
            this.match(CypherParser.MERGE);
            this.state = 472;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 471;
                this.match(CypherParser.SP);
                }
            }

            this.state = 474;
            this.oC_PatternPart();
            this.state = 479;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 54, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 475;
                    this.match(CypherParser.SP);
                    this.state = 476;
                    this.oC_MergeAction();
                    }
                    }
                }
                this.state = 481;
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
            this.state = 492;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 55, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 482;
                this.match(CypherParser.ON);
                this.state = 483;
                this.match(CypherParser.SP);
                this.state = 484;
                this.match(CypherParser.MATCH);
                this.state = 485;
                this.match(CypherParser.SP);
                this.state = 486;
                this.oC_Set();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 487;
                this.match(CypherParser.ON);
                this.state = 488;
                this.match(CypherParser.SP);
                this.state = 489;
                this.match(CypherParser.CREATE);
                this.state = 490;
                this.match(CypherParser.SP);
                this.state = 491;
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
            this.state = 494;
            this.match(CypherParser.CREATE);
            this.state = 496;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 495;
                this.match(CypherParser.SP);
                }
            }

            this.state = 498;
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
            this.state = 500;
            this.match(CypherParser.SET);
            this.state = 502;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 501;
                this.match(CypherParser.SP);
                }
            }

            this.state = 504;
            this.oC_SetItem();
            this.state = 515;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 60, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 506;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 505;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 508;
                    this.match(CypherParser.T__5);
                    this.state = 510;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 509;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 512;
                    this.oC_SetItem();
                    }
                    }
                }
                this.state = 517;
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
            this.state = 554;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 68, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 518;
                this.oC_PropertyExpression();
                this.state = 520;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 519;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 522;
                this.match(CypherParser.T__8);
                this.state = 524;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 523;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 526;
                this.oC_Expression();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 528;
                this.oC_Variable();
                this.state = 530;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 529;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 532;
                this.match(CypherParser.T__8);
                this.state = 534;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 533;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 536;
                this.oC_Expression();
                }
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 538;
                this.oC_Variable();
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
                this.match(CypherParser.T__9);
                this.state = 544;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 543;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 546;
                this.oC_Expression();
                }
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                {
                this.state = 548;
                this.oC_Variable();
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
            this.state = 558;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 61) {
                {
                this.state = 556;
                this.match(CypherParser.DETACH);
                this.state = 557;
                this.match(CypherParser.SP);
                }
            }

            this.state = 560;
            this.match(CypherParser.DELETE);
            this.state = 562;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 561;
                this.match(CypherParser.SP);
                }
            }

            this.state = 564;
            this.oC_Expression();
            this.state = 575;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 73, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
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
                    this.match(CypherParser.T__5);
                    this.state = 570;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 569;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 572;
                    this.oC_Expression();
                    }
                    }
                }
                this.state = 577;
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
            this.state = 578;
            this.match(CypherParser.REMOVE);
            this.state = 579;
            this.match(CypherParser.SP);
            this.state = 580;
            this.oC_RemoveItem();
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
                    this.oC_RemoveItem();
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
    public oC_RemoveItem(): OC_RemoveItemContext {
        let localContext = new OC_RemoveItemContext(this.context, this.state);
        this.enterRule(localContext, 42, CypherParser.RULE_oC_RemoveItem);
        try {
            this.state = 598;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 77, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 594;
                this.oC_Variable();
                this.state = 595;
                this.oC_NodeLabels();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 597;
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
            this.state = 600;
            this.match(CypherParser.CALL);
            this.state = 601;
            this.match(CypherParser.SP);
            this.state = 602;
            this.oC_ExplicitProcedureInvocation();
            this.state = 609;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 79, this.context) ) {
            case 1:
                {
                this.state = 604;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 603;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 606;
                this.match(CypherParser.YIELD);
                this.state = 607;
                this.match(CypherParser.SP);
                this.state = 608;
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
            this.state = 611;
            this.match(CypherParser.CALL);
            this.state = 612;
            this.match(CypherParser.SP);
            this.state = 615;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 80, this.context) ) {
            case 1:
                {
                this.state = 613;
                this.oC_ExplicitProcedureInvocation();
                }
                break;
            case 2:
                {
                this.state = 614;
                this.oC_ImplicitProcedureInvocation();
                }
                break;
            }
            this.state = 626;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 83, this.context) ) {
            case 1:
                {
                this.state = 618;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 617;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 620;
                this.match(CypherParser.YIELD);
                this.state = 621;
                this.match(CypherParser.SP);
                this.state = 624;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case CypherParser.T__4:
                    {
                    this.state = 622;
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
                    this.state = 623;
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
            this.state = 628;
            this.oC_YieldItem();
            this.state = 639;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 86, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 630;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 629;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 632;
                    this.match(CypherParser.T__5);
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
                    this.oC_YieldItem();
                    }
                    }
                }
                this.state = 641;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 86, this.context);
            }
            this.state = 646;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 88, this.context) ) {
            case 1:
                {
                this.state = 643;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 642;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 645;
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
            this.state = 653;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 89, this.context) ) {
            case 1:
                {
                this.state = 648;
                this.oC_ProcedureResultField();
                this.state = 649;
                this.match(CypherParser.SP);
                this.state = 650;
                this.match(CypherParser.AS);
                this.state = 651;
                this.match(CypherParser.SP);
                }
                break;
            }
            this.state = 655;
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
            this.state = 657;
            this.match(CypherParser.WITH);
            this.state = 658;
            this.oC_ProjectionBody();
            this.state = 663;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 91, this.context) ) {
            case 1:
                {
                this.state = 660;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 659;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 662;
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
            this.state = 665;
            this.match(CypherParser.RETURN);
            this.state = 666;
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
            this.state = 672;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 93, this.context) ) {
            case 1:
                {
                this.state = 669;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 668;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 671;
                this.match(CypherParser.DISTINCT);
                }
                break;
            }
            this.state = 674;
            this.match(CypherParser.SP);
            this.state = 675;
            this.oC_ProjectionItems();
            this.state = 678;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 94, this.context) ) {
            case 1:
                {
                this.state = 676;
                this.match(CypherParser.SP);
                this.state = 677;
                this.oC_Order();
                }
                break;
            }
            this.state = 682;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 95, this.context) ) {
            case 1:
                {
                this.state = 680;
                this.match(CypherParser.SP);
                this.state = 681;
                this.oC_Skip();
                }
                break;
            }
            this.state = 686;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 96, this.context) ) {
            case 1:
                {
                this.state = 684;
                this.match(CypherParser.SP);
                this.state = 685;
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
            this.state = 716;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__4:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 688;
                this.match(CypherParser.T__4);
                this.state = 699;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 99, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 690;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 689;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 692;
                        this.match(CypherParser.T__5);
                        this.state = 694;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 693;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 696;
                        this.oC_ProjectionItem();
                        }
                        }
                    }
                    this.state = 701;
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
                this.state = 702;
                this.oC_ProjectionItem();
                this.state = 713;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 102, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 704;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 703;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 706;
                        this.match(CypherParser.T__5);
                        this.state = 708;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 707;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 710;
                        this.oC_ProjectionItem();
                        }
                        }
                    }
                    this.state = 715;
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
            this.state = 725;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 104, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 718;
                this.oC_Expression();
                this.state = 719;
                this.match(CypherParser.SP);
                this.state = 720;
                this.match(CypherParser.AS);
                this.state = 721;
                this.match(CypherParser.SP);
                this.state = 722;
                this.oC_Variable();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 724;
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
            this.state = 727;
            this.match(CypherParser.ORDER);
            this.state = 728;
            this.match(CypherParser.SP);
            this.state = 729;
            this.match(CypherParser.BY);
            this.state = 730;
            this.match(CypherParser.SP);
            this.state = 731;
            this.oC_SortItem();
            this.state = 739;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 6) {
                {
                {
                this.state = 732;
                this.match(CypherParser.T__5);
                this.state = 734;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 733;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 736;
                this.oC_SortItem();
                }
                }
                this.state = 741;
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
            this.state = 742;
            this.match(CypherParser.L_SKIP);
            this.state = 743;
            this.match(CypherParser.SP);
            this.state = 744;
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
            this.state = 746;
            this.match(CypherParser.LIMIT);
            this.state = 747;
            this.match(CypherParser.SP);
            this.state = 748;
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
            this.state = 750;
            this.oC_Expression();
            this.state = 755;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 108, this.context) ) {
            case 1:
                {
                this.state = 752;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 751;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 754;
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
            this.state = 757;
            this.match(CypherParser.WHERE);
            this.state = 758;
            this.match(CypherParser.SP);
            this.state = 759;
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
            this.state = 761;
            this.oC_PatternPart();
            this.state = 772;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 111, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 763;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 762;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 765;
                    this.match(CypherParser.T__5);
                    this.state = 767;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 766;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 769;
                    this.oC_PatternPart();
                    }
                    }
                }
                this.state = 774;
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
            this.state = 786;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 114, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 775;
                this.oC_Variable();
                this.state = 777;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 776;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 779;
                this.match(CypherParser.T__8);
                this.state = 781;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 780;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 783;
                this.oC_AnonymousPatternPart();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 785;
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
            this.state = 790;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.SHORTESTPATH:
            case CypherParser.ALLSHORTESTPATHS:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 788;
                this.oC_ShortestPathPattern();
                }
                break;
            case CypherParser.T__1:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 789;
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
            this.state = 820;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.SHORTESTPATH:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 792;
                this.match(CypherParser.SHORTESTPATH);
                this.state = 794;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 793;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 796;
                this.match(CypherParser.T__1);
                this.state = 798;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 797;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 800;
                this.oC_PatternElement();
                this.state = 802;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 801;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 804;
                this.match(CypherParser.T__3);
                }
                }
                break;
            case CypherParser.ALLSHORTESTPATHS:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 806;
                this.match(CypherParser.ALLSHORTESTPATHS);
                this.state = 808;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 807;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 810;
                this.match(CypherParser.T__1);
                this.state = 812;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 811;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 814;
                this.oC_PatternElement();
                this.state = 816;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 815;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 818;
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
            this.state = 836;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 125, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 822;
                this.oC_NodePattern();
                this.state = 829;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 124, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
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
                        this.oC_PatternElementChain();
                        }
                        }
                    }
                    this.state = 831;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 124, this.context);
                }
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 832;
                this.match(CypherParser.T__1);
                this.state = 833;
                this.oC_PatternElement();
                this.state = 834;
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
    public oC_RelationshipsPattern(): OC_RelationshipsPatternContext {
        let localContext = new OC_RelationshipsPatternContext(this.context, this.state);
        this.enterRule(localContext, 82, CypherParser.RULE_oC_RelationshipsPattern);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 838;
            this.oC_NodePattern();
            this.state = 843;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
                    this.state = 840;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 839;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 842;
                    this.oC_PatternElementChain();
                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 845;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 127, this.context);
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
        this.enterRule(localContext, 84, CypherParser.RULE_oC_NodePattern);
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

            this.state = 855;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 49)) & ~0x1F) === 0 && ((1 << (_la - 49)) & 1610612751) !== 0) || ((((_la - 90)) & ~0x1F) === 0 && ((1 << (_la - 90)) & 66435) !== 0) || ((((_la - 124)) & ~0x1F) === 0 && ((1 << (_la - 124)) & 313) !== 0)) {
                {
                this.state = 851;
                this.oC_Variable();
                this.state = 853;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 852;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 861;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 14) {
                {
                this.state = 857;
                this.oC_NodeLabels();
                this.state = 859;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 858;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 867;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 7 || _la === 27) {
                {
                this.state = 863;
                this.oC_Properties();
                this.state = 865;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 864;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 869;
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
        this.enterRule(localContext, 86, CypherParser.RULE_oC_PatternElementChain);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 871;
            this.oC_RelationshipPattern();
            this.state = 876;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 136, this.context) ) {
            case 1:
                {
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
                this.oC_PathQuantifier();
                }
                break;
            }
            this.state = 879;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 878;
                this.match(CypherParser.SP);
                }
            }

            this.state = 881;
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
        this.enterRule(localContext, 88, CypherParser.RULE_oC_PathQuantifier);
        let _la: number;
        try {
            this.state = 908;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__10:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 883;
                this.match(CypherParser.T__10);
                }
                break;
            case CypherParser.T__4:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 884;
                this.match(CypherParser.T__4);
                }
                break;
            case CypherParser.T__6:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 885;
                this.match(CypherParser.T__6);
                this.state = 887;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 138, this.context) ) {
                case 1:
                    {
                    this.state = 886;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 890;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0)) {
                    {
                    this.state = 889;
                    this.oC_IntegerLiteral();
                    }
                }

                this.state = 893;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 892;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 905;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 6) {
                    {
                    this.state = 895;
                    this.match(CypherParser.T__5);
                    this.state = 897;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 141, this.context) ) {
                    case 1:
                        {
                        this.state = 896;
                        this.match(CypherParser.SP);
                        }
                        break;
                    }
                    this.state = 900;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0)) {
                        {
                        this.state = 899;
                        this.oC_IntegerLiteral();
                        }
                    }

                    this.state = 903;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 902;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                }

                this.state = 907;
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
        this.enterRule(localContext, 90, CypherParser.RULE_oC_RelationshipPattern);
        let _la: number;
        try {
            this.state = 974;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 162, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 910;
                this.oC_LeftArrowHead();
                this.state = 912;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 911;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 914;
                this.oC_Dash();
                this.state = 916;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 147, this.context) ) {
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
                if (_la === 12) {
                    {
                    this.state = 918;
                    this.oC_RelationshipDetail();
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

                this.state = 924;
                this.oC_Dash();
                this.state = 926;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 925;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 928;
                this.oC_RightArrowHead();
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 930;
                this.oC_LeftArrowHead();
                this.state = 932;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 931;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 934;
                this.oC_Dash();
                this.state = 936;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 152, this.context) ) {
                case 1:
                    {
                    this.state = 935;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 939;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 938;
                    this.oC_RelationshipDetail();
                    }
                }

                this.state = 942;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 941;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 944;
                this.oC_Dash();
                }
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 946;
                this.oC_Dash();
                this.state = 948;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 155, this.context) ) {
                case 1:
                    {
                    this.state = 947;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 951;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 950;
                    this.oC_RelationshipDetail();
                    }
                }

                this.state = 954;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 953;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 956;
                this.oC_Dash();
                this.state = 958;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 957;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 960;
                this.oC_RightArrowHead();
                }
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                {
                this.state = 962;
                this.oC_Dash();
                this.state = 964;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 159, this.context) ) {
                case 1:
                    {
                    this.state = 963;
                    this.match(CypherParser.SP);
                    }
                    break;
                }
                this.state = 967;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 966;
                    this.oC_RelationshipDetail();
                    }
                }

                this.state = 970;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 969;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 972;
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
        this.enterRule(localContext, 92, CypherParser.RULE_oC_RelationshipDetail);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 976;
            this.match(CypherParser.T__11);
            this.state = 978;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 977;
                this.match(CypherParser.SP);
                }
            }

            this.state = 984;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 49)) & ~0x1F) === 0 && ((1 << (_la - 49)) & 1610612751) !== 0) || ((((_la - 90)) & ~0x1F) === 0 && ((1 << (_la - 90)) & 66435) !== 0) || ((((_la - 124)) & ~0x1F) === 0 && ((1 << (_la - 124)) & 313) !== 0)) {
                {
                this.state = 980;
                this.oC_Variable();
                this.state = 982;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 981;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 990;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 14) {
                {
                this.state = 986;
                this.oC_RelationshipTypes();
                this.state = 988;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 987;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 993;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 5) {
                {
                this.state = 992;
                this.oC_RangeLiteral();
                }
            }

            this.state = 999;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 7 || _la === 27) {
                {
                this.state = 995;
                this.oC_Properties();
                this.state = 997;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 996;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1001;
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
        this.enterRule(localContext, 94, CypherParser.RULE_oC_Properties);
        try {
            this.state = 1005;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__6:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1003;
                this.oC_MapLiteral();
                }
                break;
            case CypherParser.T__26:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1004;
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
        this.enterRule(localContext, 96, CypherParser.RULE_oC_RelationshipTypes);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1007;
            this.match(CypherParser.T__13);
            this.state = 1009;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1008;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1011;
            this.oC_RelTypeName();
            this.state = 1025;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 176, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
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
                    this.match(CypherParser.T__2);
                    this.state = 1017;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 14) {
                        {
                        this.state = 1016;
                        this.match(CypherParser.T__13);
                        }
                    }

                    this.state = 1020;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1019;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1022;
                    this.oC_RelTypeName();
                    }
                    }
                }
                this.state = 1027;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 176, this.context);
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
        this.enterRule(localContext, 98, CypherParser.RULE_oC_NodeLabels);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1028;
            this.oC_NodeLabel();
            this.state = 1035;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 178, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1030;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1029;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1032;
                    this.oC_NodeLabel();
                    }
                    }
                }
                this.state = 1037;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 178, this.context);
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
        this.enterRule(localContext, 100, CypherParser.RULE_oC_NodeLabel);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1038;
            this.match(CypherParser.T__13);
            this.state = 1040;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1039;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1042;
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
        this.enterRule(localContext, 102, CypherParser.RULE_oC_RangeLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1044;
            this.match(CypherParser.T__4);
            this.state = 1046;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1045;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1052;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0)) {
                {
                this.state = 1048;
                this.oC_IntegerLiteral();
                this.state = 1050;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1049;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1064;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 15) {
                {
                this.state = 1054;
                this.match(CypherParser.T__14);
                this.state = 1056;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1055;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1062;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 103)) & ~0x1F) === 0 && ((1 << (_la - 103)) & 7) !== 0)) {
                    {
                    this.state = 1058;
                    this.oC_IntegerLiteral();
                    this.state = 1060;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1059;
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
        this.enterRule(localContext, 104, CypherParser.RULE_oC_LabelName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1066;
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
        this.enterRule(localContext, 106, CypherParser.RULE_oC_RelTypeName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1068;
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
        this.enterRule(localContext, 108, CypherParser.RULE_oC_PropertyExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1070;
            this.oC_Atom();
            this.state = 1075;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
                    this.state = 1072;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1071;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1074;
                    this.oC_PropertyLookup();
                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 1077;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 188, this.context);
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
        this.enterRule(localContext, 110, CypherParser.RULE_oC_Expression);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1079;
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
        this.enterRule(localContext, 112, CypherParser.RULE_oC_OrExpression);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1081;
            this.oC_XorExpression();
            this.state = 1088;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 189, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1082;
                    this.match(CypherParser.SP);
                    this.state = 1083;
                    this.match(CypherParser.OR);
                    this.state = 1084;
                    this.match(CypherParser.SP);
                    this.state = 1085;
                    this.oC_XorExpression();
                    }
                    }
                }
                this.state = 1090;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 189, this.context);
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
        this.enterRule(localContext, 114, CypherParser.RULE_oC_XorExpression);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1091;
            this.oC_AndExpression();
            this.state = 1098;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 190, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1092;
                    this.match(CypherParser.SP);
                    this.state = 1093;
                    this.match(CypherParser.XOR);
                    this.state = 1094;
                    this.match(CypherParser.SP);
                    this.state = 1095;
                    this.oC_AndExpression();
                    }
                    }
                }
                this.state = 1100;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 190, this.context);
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
        this.enterRule(localContext, 116, CypherParser.RULE_oC_AndExpression);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1101;
            this.oC_NotExpression();
            this.state = 1108;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 191, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1102;
                    this.match(CypherParser.SP);
                    this.state = 1103;
                    this.match(CypherParser.AND);
                    this.state = 1104;
                    this.match(CypherParser.SP);
                    this.state = 1105;
                    this.oC_NotExpression();
                    }
                    }
                }
                this.state = 1110;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 191, this.context);
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
        this.enterRule(localContext, 118, CypherParser.RULE_oC_NotExpression);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1117;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 83) {
                {
                {
                this.state = 1111;
                this.match(CypherParser.NOT);
                this.state = 1113;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1112;
                    this.match(CypherParser.SP);
                    }
                }

                }
                }
                this.state = 1119;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1120;
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
        this.enterRule(localContext, 120, CypherParser.RULE_oC_ComparisonExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1122;
            this.oC_StringListNullPredicateExpression();
            this.state = 1129;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 195, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1124;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1123;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1126;
                    this.oC_PartialComparisonExpression();
                    }
                    }
                }
                this.state = 1131;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 195, this.context);
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
        this.enterRule(localContext, 122, CypherParser.RULE_oC_PartialComparisonExpression);
        let _la: number;
        try {
            this.state = 1162;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.T__8:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1132;
                this.match(CypherParser.T__8);
                this.state = 1134;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1133;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1136;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__15:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1137;
                this.match(CypherParser.T__15);
                this.state = 1139;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1138;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1141;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__16:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 1142;
                this.match(CypherParser.T__16);
                this.state = 1144;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1143;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1146;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__17:
                this.enterOuterAlt(localContext, 4);
                {
                {
                this.state = 1147;
                this.match(CypherParser.T__17);
                this.state = 1149;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1148;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1151;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__18:
                this.enterOuterAlt(localContext, 5);
                {
                {
                this.state = 1152;
                this.match(CypherParser.T__18);
                this.state = 1154;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1153;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1156;
                this.oC_StringListNullPredicateExpression();
                }
                }
                break;
            case CypherParser.T__19:
                this.enterOuterAlt(localContext, 6);
                {
                {
                this.state = 1157;
                this.match(CypherParser.T__19);
                this.state = 1159;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1158;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1161;
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
        this.enterRule(localContext, 124, CypherParser.RULE_oC_StringListNullPredicateExpression);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1164;
            this.oC_AddOrSubtractExpression();
            this.state = 1170;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 204, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    this.state = 1168;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 203, this.context) ) {
                    case 1:
                        {
                        this.state = 1165;
                        this.oC_StringPredicateExpression();
                        }
                        break;
                    case 2:
                        {
                        this.state = 1166;
                        this.oC_ListPredicateExpression();
                        }
                        break;
                    case 3:
                        {
                        this.state = 1167;
                        this.oC_NullPredicateExpression();
                        }
                        break;
                    }
                    }
                }
                this.state = 1172;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 204, this.context);
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
        this.enterRule(localContext, 126, CypherParser.RULE_oC_StringPredicateExpression);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1187;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 206, this.context) ) {
            case 1:
                {
                {
                this.state = 1173;
                this.match(CypherParser.SP);
                this.state = 1174;
                this.match(CypherParser.STARTS);
                this.state = 1175;
                this.match(CypherParser.SP);
                this.state = 1176;
                this.match(CypherParser.WITH);
                }
                }
                break;
            case 2:
                {
                {
                this.state = 1177;
                this.match(CypherParser.SP);
                this.state = 1178;
                this.match(CypherParser.ENDS);
                this.state = 1179;
                this.match(CypherParser.SP);
                this.state = 1180;
                this.match(CypherParser.WITH);
                }
                }
                break;
            case 3:
                {
                {
                this.state = 1181;
                this.match(CypherParser.SP);
                this.state = 1182;
                this.match(CypherParser.CONTAINS);
                }
                }
                break;
            case 4:
                {
                {
                this.state = 1184;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1183;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1186;
                this.match(CypherParser.T__20);
                }
                }
                break;
            }
            this.state = 1190;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1189;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1192;
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
        this.enterRule(localContext, 128, CypherParser.RULE_oC_ListPredicateExpression);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1194;
            this.match(CypherParser.SP);
            this.state = 1195;
            this.match(CypherParser.IN);
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
        this.enterRule(localContext, 130, CypherParser.RULE_oC_NullPredicateExpression);
        try {
            this.state = 1211;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 209, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1201;
                this.match(CypherParser.SP);
                this.state = 1202;
                this.match(CypherParser.IS);
                this.state = 1203;
                this.match(CypherParser.SP);
                this.state = 1204;
                this.match(CypherParser.NULL);
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1205;
                this.match(CypherParser.SP);
                this.state = 1206;
                this.match(CypherParser.IS);
                this.state = 1207;
                this.match(CypherParser.SP);
                this.state = 1208;
                this.match(CypherParser.NOT);
                this.state = 1209;
                this.match(CypherParser.SP);
                this.state = 1210;
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
        this.enterRule(localContext, 132, CypherParser.RULE_oC_AddOrSubtractExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1213;
            this.oC_MultiplyDivideModuloExpression();
            this.state = 1232;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 215, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    this.state = 1230;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 214, this.context) ) {
                    case 1:
                        {
                        {
                        this.state = 1215;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1214;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1217;
                        this.match(CypherParser.T__10);
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
                        this.oC_MultiplyDivideModuloExpression();
                        }
                        }
                        break;
                    case 2:
                        {
                        {
                        this.state = 1223;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1222;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1225;
                        this.match(CypherParser.T__21);
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
                        this.oC_MultiplyDivideModuloExpression();
                        }
                        }
                        break;
                    }
                    }
                }
                this.state = 1234;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 215, this.context);
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
        this.enterRule(localContext, 134, CypherParser.RULE_oC_MultiplyDivideModuloExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1235;
            this.oC_PowerOfExpression();
            this.state = 1262;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 223, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    this.state = 1260;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 222, this.context) ) {
                    case 1:
                        {
                        {
                        this.state = 1237;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1236;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1239;
                        this.match(CypherParser.T__4);
                        this.state = 1241;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1240;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1243;
                        this.oC_PowerOfExpression();
                        }
                        }
                        break;
                    case 2:
                        {
                        {
                        this.state = 1245;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1244;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1247;
                        this.match(CypherParser.T__22);
                        this.state = 1249;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1248;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1251;
                        this.oC_PowerOfExpression();
                        }
                        }
                        break;
                    case 3:
                        {
                        {
                        this.state = 1253;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1252;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1255;
                        this.match(CypherParser.T__23);
                        this.state = 1257;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1256;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1259;
                        this.oC_PowerOfExpression();
                        }
                        }
                        break;
                    }
                    }
                }
                this.state = 1264;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 223, this.context);
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
        this.enterRule(localContext, 136, CypherParser.RULE_oC_PowerOfExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1265;
            this.oC_UnaryAddOrSubtractExpression();
            this.state = 1276;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 226, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1267;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1266;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1269;
                    this.match(CypherParser.T__24);
                    this.state = 1271;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1270;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1273;
                    this.oC_UnaryAddOrSubtractExpression();
                    }
                    }
                }
                this.state = 1278;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 226, this.context);
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
        this.enterRule(localContext, 138, CypherParser.RULE_oC_UnaryAddOrSubtractExpression);
        let _la: number;
        try {
            this.state = 1285;
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
                this.state = 1279;
                this.oC_NonArithmeticOperatorExpression();
                }
                break;
            case CypherParser.T__10:
            case CypherParser.T__21:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1280;
                _la = this.tokenStream.LA(1);
                if(!(_la === 11 || _la === 22)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
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
        this.enterRule(localContext, 140, CypherParser.RULE_oC_NonArithmeticOperatorExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1287;
            this.oC_Atom();
            this.state = 1298;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 232, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    this.state = 1296;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 231, this.context) ) {
                    case 1:
                        {
                        {
                        this.state = 1289;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1288;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1291;
                        this.oC_ListOperatorExpression();
                        }
                        }
                        break;
                    case 2:
                        {
                        {
                        this.state = 1293;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1292;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1295;
                        this.oC_PropertyLookup();
                        }
                        }
                        break;
                    }
                    }
                }
                this.state = 1300;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 232, this.context);
            }
            this.state = 1305;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 234, this.context) ) {
            case 1:
                {
                this.state = 1302;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1301;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1304;
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
        this.enterRule(localContext, 142, CypherParser.RULE_oC_ListOperatorExpression);
        let _la: number;
        try {
            this.state = 1320;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 237, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1307;
                this.match(CypherParser.T__11);
                this.state = 1308;
                this.oC_Expression();
                this.state = 1309;
                this.match(CypherParser.T__12);
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1311;
                this.match(CypherParser.T__11);
                this.state = 1313;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 3221225503) !== 0) || ((((_la - 83)) & ~0x1F) === 0 && ((1 << (_la - 83)) & 3237987265) !== 0) || ((((_la - 115)) & ~0x1F) === 0 && ((1 << (_la - 115)) & 160257) !== 0)) {
                    {
                    this.state = 1312;
                    this.oC_Expression();
                    }
                }

                this.state = 1315;
                this.match(CypherParser.T__14);
                this.state = 1317;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 3221225503) !== 0) || ((((_la - 83)) & ~0x1F) === 0 && ((1 << (_la - 83)) & 3237987265) !== 0) || ((((_la - 115)) & ~0x1F) === 0 && ((1 << (_la - 115)) & 160257) !== 0)) {
                    {
                    this.state = 1316;
                    this.oC_Expression();
                    }
                }

                this.state = 1319;
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
        this.enterRule(localContext, 144, CypherParser.RULE_oC_PropertyLookup);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1322;
            this.match(CypherParser.T__25);
            this.state = 1324;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1323;
                this.match(CypherParser.SP);
                }
            }

            {
            this.state = 1326;
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
        this.enterRule(localContext, 146, CypherParser.RULE_oC_Atom);
        let _la: number;
        try {
            this.state = 1355;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 242, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1328;
                this.oC_Literal();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1329;
                this.oC_Parameter();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 1330;
                this.oC_CaseExpression();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1331;
                this.oC_CountSubquery();
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                {
                this.state = 1332;
                this.match(CypherParser.COUNT);
                this.state = 1334;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1333;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1336;
                this.match(CypherParser.T__1);
                this.state = 1338;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1337;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1340;
                this.match(CypherParser.T__4);
                this.state = 1342;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1341;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1344;
                this.match(CypherParser.T__3);
                }
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1345;
                this.oC_ListComprehension();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 1346;
                this.oC_PatternComprehension();
                }
                break;
            case 8:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 1347;
                this.oC_Quantifier();
                }
                break;
            case 9:
                this.enterOuterAlt(localContext, 9);
                {
                this.state = 1348;
                this.oC_Reduce();
                }
                break;
            case 10:
                this.enterOuterAlt(localContext, 10);
                {
                this.state = 1349;
                this.oC_PatternPredicate();
                }
                break;
            case 11:
                this.enterOuterAlt(localContext, 11);
                {
                this.state = 1350;
                this.oC_ParenthesizedExpression();
                }
                break;
            case 12:
                this.enterOuterAlt(localContext, 12);
                {
                this.state = 1351;
                this.oC_FunctionInvocation();
                }
                break;
            case 13:
                this.enterOuterAlt(localContext, 13);
                {
                this.state = 1352;
                this.oC_ExistentialSubquery();
                }
                break;
            case 14:
                this.enterOuterAlt(localContext, 14);
                {
                this.state = 1353;
                this.oC_MapProjection();
                }
                break;
            case 15:
                this.enterOuterAlt(localContext, 15);
                {
                this.state = 1354;
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
        this.enterRule(localContext, 148, CypherParser.RULE_oC_Reduce);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1357;
            this.match(CypherParser.REDUCE);
            this.state = 1359;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1358;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1361;
            this.match(CypherParser.T__1);
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
            this.oC_Variable();
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
            this.match(CypherParser.T__8);
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
            this.oC_Expression();
            this.state = 1375;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1374;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1377;
            this.match(CypherParser.T__5);
            this.state = 1379;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1378;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1381;
            this.oC_IdInColl();
            this.state = 1383;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1382;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1385;
            this.match(CypherParser.T__2);
            this.state = 1387;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1386;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1389;
            this.oC_Expression();
            this.state = 1391;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1390;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1393;
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
        this.enterRule(localContext, 150, CypherParser.RULE_oC_MapProjection);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1395;
            this.oC_Variable();
            this.state = 1397;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1396;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1399;
            this.match(CypherParser.T__6);
            this.state = 1401;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1400;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1420;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 26 || ((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294574079) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 150994943) !== 0) || ((((_la - 117)) & ~0x1F) === 0 && ((1 << (_la - 117)) & 40959) !== 0)) {
                {
                this.state = 1403;
                this.oC_MapProjectionElement();
                this.state = 1405;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1404;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1417;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1407;
                    this.match(CypherParser.T__5);
                    this.state = 1409;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1408;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1411;
                    this.oC_MapProjectionElement();
                    this.state = 1413;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1412;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1419;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1422;
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
        this.enterRule(localContext, 152, CypherParser.RULE_oC_MapProjectionElement);
        let _la: number;
        try {
            this.state = 1445;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 263, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1424;
                this.oC_PropertyKeyName();
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
                this.match(CypherParser.T__13);
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
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1434;
                this.match(CypherParser.T__25);
                this.state = 1436;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1435;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1438;
                this.oC_PropertyKeyName();
                }
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 1439;
                this.match(CypherParser.T__25);
                this.state = 1441;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1440;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1443;
                this.match(CypherParser.T__4);
                }
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1444;
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
        this.enterRule(localContext, 154, CypherParser.RULE_oC_CaseExpression);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1469;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 269, this.context) ) {
            case 1:
                {
                {
                this.state = 1447;
                this.match(CypherParser.CASE);
                this.state = 1452;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 1449;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1448;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1451;
                        this.oC_CaseAlternative();
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 1454;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 265, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                }
                }
                break;
            case 2:
                {
                {
                this.state = 1456;
                this.match(CypherParser.CASE);
                this.state = 1458;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1457;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1460;
                this.oC_Expression();
                this.state = 1465;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 1462;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 133) {
                            {
                            this.state = 1461;
                            this.match(CypherParser.SP);
                            }
                        }

                        this.state = 1464;
                        this.oC_CaseAlternative();
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 1467;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 268, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                }
                }
                break;
            }
            this.state = 1479;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 272, this.context) ) {
            case 1:
                {
                this.state = 1472;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1471;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1474;
                this.match(CypherParser.ELSE);
                this.state = 1476;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1475;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1478;
                this.oC_Expression();
                }
                break;
            }
            this.state = 1482;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1481;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1484;
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
        this.enterRule(localContext, 156, CypherParser.RULE_oC_CaseAlternative);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1486;
            this.match(CypherParser.WHEN);
            this.state = 1488;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1487;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1490;
            this.oC_Expression();
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
            this.match(CypherParser.THEN);
            this.state = 1496;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1495;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1498;
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
        this.enterRule(localContext, 158, CypherParser.RULE_oC_ListComprehension);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1500;
            this.match(CypherParser.T__11);
            this.state = 1502;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1501;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1504;
            this.oC_FilterExpression();
            this.state = 1513;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 280, this.context) ) {
            case 1:
                {
                this.state = 1506;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1505;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1508;
                this.match(CypherParser.T__2);
                this.state = 1510;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1509;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1512;
                this.oC_Expression();
                }
                break;
            }
            this.state = 1516;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1515;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1518;
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
        this.enterRule(localContext, 160, CypherParser.RULE_oC_PatternComprehension);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1520;
            this.match(CypherParser.T__11);
            this.state = 1522;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1521;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1532;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 49)) & ~0x1F) === 0 && ((1 << (_la - 49)) & 1610612751) !== 0) || ((((_la - 90)) & ~0x1F) === 0 && ((1 << (_la - 90)) & 66435) !== 0) || ((((_la - 124)) & ~0x1F) === 0 && ((1 << (_la - 124)) & 313) !== 0)) {
                {
                this.state = 1524;
                this.oC_Variable();
                this.state = 1526;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1525;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1528;
                this.match(CypherParser.T__8);
                this.state = 1530;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1529;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1534;
            this.oC_RelationshipsPattern();
            this.state = 1536;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1535;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1542;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 77) {
                {
                this.state = 1538;
                this.oC_Where();
                this.state = 1540;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1539;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1544;
            this.match(CypherParser.T__2);
            this.state = 1546;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1545;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1548;
            this.oC_Expression();
            this.state = 1550;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1549;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1552;
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
        this.enterRule(localContext, 162, CypherParser.RULE_oC_Quantifier);
        let _la: number;
        try {
            this.state = 1610;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.ALL:
                this.enterOuterAlt(localContext, 1);
                {
                {
                this.state = 1554;
                this.match(CypherParser.ALL);
                this.state = 1556;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1555;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1558;
                this.match(CypherParser.T__1);
                this.state = 1560;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1559;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1562;
                this.oC_FilterExpression();
                this.state = 1564;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1563;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1566;
                this.match(CypherParser.T__3);
                }
                }
                break;
            case CypherParser.ANY:
                this.enterOuterAlt(localContext, 2);
                {
                {
                this.state = 1568;
                this.match(CypherParser.ANY);
                this.state = 1570;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1569;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1572;
                this.match(CypherParser.T__1);
                this.state = 1574;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1573;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1576;
                this.oC_FilterExpression();
                this.state = 1578;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1577;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1580;
                this.match(CypherParser.T__3);
                }
                }
                break;
            case CypherParser.NONE:
                this.enterOuterAlt(localContext, 3);
                {
                {
                this.state = 1582;
                this.match(CypherParser.NONE);
                this.state = 1584;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1583;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1586;
                this.match(CypherParser.T__1);
                this.state = 1588;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1587;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1590;
                this.oC_FilterExpression();
                this.state = 1592;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1591;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1594;
                this.match(CypherParser.T__3);
                }
                }
                break;
            case CypherParser.SINGLE:
                this.enterOuterAlt(localContext, 4);
                {
                {
                this.state = 1596;
                this.match(CypherParser.SINGLE);
                this.state = 1598;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1597;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1600;
                this.match(CypherParser.T__1);
                this.state = 1602;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1601;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1604;
                this.oC_FilterExpression();
                this.state = 1606;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1605;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1608;
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
        this.enterRule(localContext, 164, CypherParser.RULE_oC_FilterExpression);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1612;
            this.oC_IdInColl();
            this.state = 1617;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 305, this.context) ) {
            case 1:
                {
                this.state = 1614;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1613;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1616;
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
        this.enterRule(localContext, 166, CypherParser.RULE_oC_PatternPredicate);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1619;
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
        this.enterRule(localContext, 168, CypherParser.RULE_oC_ParenthesizedExpression);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1621;
            this.match(CypherParser.T__1);
            this.state = 1623;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1622;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1625;
            this.oC_Expression();
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
        this.enterRule(localContext, 170, CypherParser.RULE_oC_IdInColl);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1631;
            this.oC_Variable();
            this.state = 1632;
            this.match(CypherParser.SP);
            this.state = 1633;
            this.match(CypherParser.IN);
            this.state = 1634;
            this.match(CypherParser.SP);
            this.state = 1635;
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
        this.enterRule(localContext, 172, CypherParser.RULE_oC_FunctionInvocation);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1637;
            this.oC_FunctionName();
            this.state = 1639;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1638;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1641;
            this.match(CypherParser.T__1);
            this.state = 1643;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1642;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1649;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 68) {
                {
                this.state = 1645;
                this.match(CypherParser.DISTINCT);
                this.state = 1647;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1646;
                    this.match(CypherParser.SP);
                    }
                }

                }
            }

            this.state = 1668;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 3221225503) !== 0) || ((((_la - 83)) & ~0x1F) === 0 && ((1 << (_la - 83)) & 3237987265) !== 0) || ((((_la - 115)) & ~0x1F) === 0 && ((1 << (_la - 115)) & 160257) !== 0)) {
                {
                this.state = 1651;
                this.oC_Expression();
                this.state = 1653;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1652;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1665;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1655;
                    this.match(CypherParser.T__5);
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
                    this.oC_Expression();
                    this.state = 1661;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1660;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1667;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1670;
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
        this.enterRule(localContext, 174, CypherParser.RULE_oC_FunctionName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1672;
            this.oC_Namespace();
            this.state = 1673;
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
        this.enterRule(localContext, 176, CypherParser.RULE_oC_ExistentialSubquery);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1675;
            this.match(CypherParser.EXISTS);
            this.state = 1677;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1676;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1679;
            this.match(CypherParser.T__6);
            this.state = 1681;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1680;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1692;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 321, this.context) ) {
            case 1:
                {
                this.state = 1683;
                this.oC_RegularQuery();
                }
                break;
            case 2:
                {
                this.state = 1684;
                this.oC_SubqueryReadings();
                }
                break;
            case 3:
                {
                {
                this.state = 1685;
                this.oC_Pattern();
                this.state = 1690;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 320, this.context) ) {
                case 1:
                    {
                    this.state = 1687;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1686;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1689;
                    this.oC_Where();
                    }
                    break;
                }
                }
                }
                break;
            }
            this.state = 1695;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1694;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1697;
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
        this.enterRule(localContext, 178, CypherParser.RULE_oC_CountSubquery);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1699;
            this.match(CypherParser.COUNT);
            this.state = 1701;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1700;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1703;
            this.match(CypherParser.T__6);
            this.state = 1705;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1704;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1716;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 327, this.context) ) {
            case 1:
                {
                this.state = 1707;
                this.oC_RegularQuery();
                }
                break;
            case 2:
                {
                this.state = 1708;
                this.oC_SubqueryReadings();
                }
                break;
            case 3:
                {
                {
                this.state = 1709;
                this.oC_Pattern();
                this.state = 1714;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 326, this.context) ) {
                case 1:
                    {
                    this.state = 1711;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1710;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1713;
                    this.oC_Where();
                    }
                    break;
                }
                }
                }
                break;
            }
            this.state = 1719;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1718;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1721;
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
        this.enterRule(localContext, 180, CypherParser.RULE_oC_SubqueryReadings);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1723;
            this.oC_ReadingClause();
            this.state = 1730;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 330, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1725;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1724;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1727;
                    this.oC_ReadingClause();
                    }
                    }
                }
                this.state = 1732;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 330, this.context);
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
        this.enterRule(localContext, 182, CypherParser.RULE_oC_ExplicitProcedureInvocation);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1733;
            this.oC_ProcedureName();
            this.state = 1735;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1734;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1737;
            this.match(CypherParser.T__1);
            this.state = 1739;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1738;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1758;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 3221225503) !== 0) || ((((_la - 83)) & ~0x1F) === 0 && ((1 << (_la - 83)) & 3237987265) !== 0) || ((((_la - 115)) & ~0x1F) === 0 && ((1 << (_la - 115)) & 160257) !== 0)) {
                {
                this.state = 1741;
                this.oC_Expression();
                this.state = 1743;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1742;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1755;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1745;
                    this.match(CypherParser.T__5);
                    this.state = 1747;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1746;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1749;
                    this.oC_Expression();
                    this.state = 1751;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1750;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1757;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1760;
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
        this.enterRule(localContext, 184, CypherParser.RULE_oC_ImplicitProcedureInvocation);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1762;
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
        this.enterRule(localContext, 186, CypherParser.RULE_oC_ProcedureResultField);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1764;
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
        this.enterRule(localContext, 188, CypherParser.RULE_oC_ProcedureName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1766;
            this.oC_Namespace();
            this.state = 1767;
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
        this.enterRule(localContext, 190, CypherParser.RULE_oC_Namespace);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1774;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 338, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1769;
                    this.oC_SymbolicName();
                    this.state = 1770;
                    this.match(CypherParser.T__25);
                    }
                    }
                }
                this.state = 1776;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 338, this.context);
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
        this.enterRule(localContext, 192, CypherParser.RULE_oC_Variable);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1777;
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
        this.enterRule(localContext, 194, CypherParser.RULE_oC_Literal);
        try {
            this.state = 1785;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.TRUE:
            case CypherParser.FALSE:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1779;
                this.oC_BooleanLiteral();
                }
                break;
            case CypherParser.NULL:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1780;
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
                this.state = 1781;
                this.oC_NumberLiteral();
                }
                break;
            case CypherParser.StringLiteral:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1782;
                this.match(CypherParser.StringLiteral);
                }
                break;
            case CypherParser.T__11:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 1783;
                this.oC_ListLiteral();
                }
                break;
            case CypherParser.T__6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1784;
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
        this.enterRule(localContext, 196, CypherParser.RULE_oC_BooleanLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1787;
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
        this.enterRule(localContext, 198, CypherParser.RULE_oC_NumberLiteral);
        try {
            this.state = 1791;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CypherParser.ExponentDecimalReal:
            case CypherParser.RegularDecimalReal:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1789;
                this.oC_DoubleLiteral();
                }
                break;
            case CypherParser.HexInteger:
            case CypherParser.DecimalInteger:
            case CypherParser.OctalInteger:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1790;
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
        this.enterRule(localContext, 200, CypherParser.RULE_oC_IntegerLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1793;
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
        this.enterRule(localContext, 202, CypherParser.RULE_oC_DoubleLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1795;
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
        this.enterRule(localContext, 204, CypherParser.RULE_oC_ListLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1797;
            this.match(CypherParser.T__11);
            this.state = 1799;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1798;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1818;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 138418308) !== 0) || ((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 3221225503) !== 0) || ((((_la - 83)) & ~0x1F) === 0 && ((1 << (_la - 83)) & 3237987265) !== 0) || ((((_la - 115)) & ~0x1F) === 0 && ((1 << (_la - 115)) & 160257) !== 0)) {
                {
                this.state = 1801;
                this.oC_Expression();
                this.state = 1803;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1802;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1815;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1805;
                    this.match(CypherParser.T__5);
                    this.state = 1807;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1806;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1809;
                    this.oC_Expression();
                    this.state = 1811;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1810;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1817;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1820;
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
        this.enterRule(localContext, 206, CypherParser.RULE_oC_MapLiteral);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1822;
            this.match(CypherParser.T__6);
            this.state = 1824;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 133) {
                {
                this.state = 1823;
                this.match(CypherParser.SP);
                }
            }

            this.state = 1859;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 4294574079) !== 0) || ((((_la - 79)) & ~0x1F) === 0 && ((1 << (_la - 79)) & 150994943) !== 0) || ((((_la - 117)) & ~0x1F) === 0 && ((1 << (_la - 117)) & 40959) !== 0)) {
                {
                this.state = 1826;
                this.oC_PropertyKeyName();
                this.state = 1828;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1827;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1830;
                this.match(CypherParser.T__13);
                this.state = 1832;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1831;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1834;
                this.oC_Expression();
                this.state = 1836;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 133) {
                    {
                    this.state = 1835;
                    this.match(CypherParser.SP);
                    }
                }

                this.state = 1856;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 6) {
                    {
                    {
                    this.state = 1838;
                    this.match(CypherParser.T__5);
                    this.state = 1840;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1839;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1842;
                    this.oC_PropertyKeyName();
                    this.state = 1844;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1843;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1846;
                    this.match(CypherParser.T__13);
                    this.state = 1848;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1847;
                        this.match(CypherParser.SP);
                        }
                    }

                    this.state = 1850;
                    this.oC_Expression();
                    this.state = 1852;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 133) {
                        {
                        this.state = 1851;
                        this.match(CypherParser.SP);
                        }
                    }

                    }
                    }
                    this.state = 1858;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1861;
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
        this.enterRule(localContext, 208, CypherParser.RULE_oC_PropertyKeyName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1863;
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
        this.enterRule(localContext, 210, CypherParser.RULE_oC_Parameter);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1865;
            this.match(CypherParser.T__26);
            this.state = 1868;
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
                this.state = 1866;
                this.oC_SymbolicName();
                }
                break;
            case CypherParser.DecimalInteger:
                {
                this.state = 1867;
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
        this.enterRule(localContext, 212, CypherParser.RULE_oC_SchemaName);
        try {
            this.state = 1872;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 358, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1870;
                this.oC_SymbolicName();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1871;
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
        this.enterRule(localContext, 214, CypherParser.RULE_oC_ReservedWord);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1874;
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
        this.enterRule(localContext, 216, CypherParser.RULE_oC_SymbolicName);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1876;
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
        this.enterRule(localContext, 218, CypherParser.RULE_oC_LeftArrowHead);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1878;
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
        this.enterRule(localContext, 220, CypherParser.RULE_oC_RightArrowHead);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1880;
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
        this.enterRule(localContext, 222, CypherParser.RULE_oC_Dash);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1882;
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
        4,1,135,1885,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,
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
        7,109,2,110,7,110,2,111,7,111,1,0,3,0,226,8,0,1,0,1,0,3,0,230,8,
        0,1,0,3,0,233,8,0,1,0,3,0,236,8,0,1,0,1,0,1,1,1,1,1,2,1,2,3,2,244,
        8,2,1,3,1,3,3,3,248,8,3,1,3,5,3,251,8,3,10,3,12,3,254,9,3,1,4,1,
        4,1,4,1,4,3,4,260,8,4,1,4,1,4,1,4,3,4,265,8,4,1,4,3,4,268,8,4,1,
        5,1,5,3,5,272,8,5,1,6,1,6,3,6,276,8,6,5,6,278,8,6,10,6,12,6,281,
        9,6,1,6,1,6,1,6,3,6,286,8,6,5,6,288,8,6,10,6,12,6,291,9,6,1,6,1,
        6,3,6,295,8,6,1,6,5,6,298,8,6,10,6,12,6,301,9,6,1,6,3,6,304,8,6,
        1,6,3,6,307,8,6,3,6,309,8,6,1,7,1,7,3,7,313,8,7,5,7,315,8,7,10,7,
        12,7,318,9,7,1,7,1,7,3,7,322,8,7,5,7,324,8,7,10,7,12,7,327,9,7,1,
        7,1,7,3,7,331,8,7,4,7,333,8,7,11,7,12,7,334,1,7,1,7,1,8,1,8,1,8,
        1,8,1,8,1,8,1,8,3,8,346,8,8,1,9,1,9,3,9,350,8,9,1,9,1,9,3,9,354,
        8,9,1,9,1,9,1,9,1,9,1,9,1,9,3,9,362,8,9,1,9,1,9,3,9,366,8,9,1,9,
        4,9,369,8,9,11,9,12,9,370,1,9,3,9,374,8,9,1,9,1,9,1,10,1,10,1,10,
        1,10,3,10,382,8,10,1,11,1,11,3,11,386,8,11,1,11,1,11,3,11,390,8,
        11,1,11,1,11,3,11,394,8,11,1,11,1,11,1,11,3,11,399,8,11,1,11,1,11,
        3,11,403,8,11,1,11,5,11,406,8,11,10,11,12,11,409,9,11,3,11,411,8,
        11,1,11,3,11,414,8,11,1,11,1,11,3,11,418,8,11,3,11,420,8,11,1,11,
        1,11,3,11,424,8,11,1,11,1,11,3,11,428,8,11,1,11,1,11,1,11,1,11,1,
        11,1,11,1,11,1,11,1,11,1,11,1,11,1,11,3,11,442,8,11,3,11,444,8,11,
        1,12,1,12,3,12,448,8,12,1,12,1,12,3,12,452,8,12,1,12,1,12,3,12,456,
        8,12,1,12,3,12,459,8,12,1,13,1,13,3,13,463,8,13,1,13,1,13,1,13,1,
        13,1,13,1,13,1,14,1,14,3,14,473,8,14,1,14,1,14,1,14,5,14,478,8,14,
        10,14,12,14,481,9,14,1,15,1,15,1,15,1,15,1,15,1,15,1,15,1,15,1,15,
        1,15,3,15,493,8,15,1,16,1,16,3,16,497,8,16,1,16,1,16,1,17,1,17,3,
        17,503,8,17,1,17,1,17,3,17,507,8,17,1,17,1,17,3,17,511,8,17,1,17,
        5,17,514,8,17,10,17,12,17,517,9,17,1,18,1,18,3,18,521,8,18,1,18,
        1,18,3,18,525,8,18,1,18,1,18,1,18,1,18,3,18,531,8,18,1,18,1,18,3,
        18,535,8,18,1,18,1,18,1,18,1,18,3,18,541,8,18,1,18,1,18,3,18,545,
        8,18,1,18,1,18,1,18,1,18,3,18,551,8,18,1,18,1,18,3,18,555,8,18,1,
        19,1,19,3,19,559,8,19,1,19,1,19,3,19,563,8,19,1,19,1,19,3,19,567,
        8,19,1,19,1,19,3,19,571,8,19,1,19,5,19,574,8,19,10,19,12,19,577,
        9,19,1,20,1,20,1,20,1,20,3,20,583,8,20,1,20,1,20,3,20,587,8,20,1,
        20,5,20,590,8,20,10,20,12,20,593,9,20,1,21,1,21,1,21,1,21,3,21,599,
        8,21,1,22,1,22,1,22,1,22,3,22,605,8,22,1,22,1,22,1,22,3,22,610,8,
        22,1,23,1,23,1,23,1,23,3,23,616,8,23,1,23,3,23,619,8,23,1,23,1,23,
        1,23,1,23,3,23,625,8,23,3,23,627,8,23,1,24,1,24,3,24,631,8,24,1,
        24,1,24,3,24,635,8,24,1,24,5,24,638,8,24,10,24,12,24,641,9,24,1,
        24,3,24,644,8,24,1,24,3,24,647,8,24,1,25,1,25,1,25,1,25,1,25,3,25,
        654,8,25,1,25,1,25,1,26,1,26,1,26,3,26,661,8,26,1,26,3,26,664,8,
        26,1,27,1,27,1,27,1,28,3,28,670,8,28,1,28,3,28,673,8,28,1,28,1,28,
        1,28,1,28,3,28,679,8,28,1,28,1,28,3,28,683,8,28,1,28,1,28,3,28,687,
        8,28,1,29,1,29,3,29,691,8,29,1,29,1,29,3,29,695,8,29,1,29,5,29,698,
        8,29,10,29,12,29,701,9,29,1,29,1,29,3,29,705,8,29,1,29,1,29,3,29,
        709,8,29,1,29,5,29,712,8,29,10,29,12,29,715,9,29,3,29,717,8,29,1,
        30,1,30,1,30,1,30,1,30,1,30,1,30,3,30,726,8,30,1,31,1,31,1,31,1,
        31,1,31,1,31,1,31,3,31,735,8,31,1,31,5,31,738,8,31,10,31,12,31,741,
        9,31,1,32,1,32,1,32,1,32,1,33,1,33,1,33,1,33,1,34,1,34,3,34,753,
        8,34,1,34,3,34,756,8,34,1,35,1,35,1,35,1,35,1,36,1,36,3,36,764,8,
        36,1,36,1,36,3,36,768,8,36,1,36,5,36,771,8,36,10,36,12,36,774,9,
        36,1,37,1,37,3,37,778,8,37,1,37,1,37,3,37,782,8,37,1,37,1,37,1,37,
        3,37,787,8,37,1,38,1,38,3,38,791,8,38,1,39,1,39,3,39,795,8,39,1,
        39,1,39,3,39,799,8,39,1,39,1,39,3,39,803,8,39,1,39,1,39,1,39,1,39,
        3,39,809,8,39,1,39,1,39,3,39,813,8,39,1,39,1,39,3,39,817,8,39,1,
        39,1,39,3,39,821,8,39,1,40,1,40,3,40,825,8,40,1,40,5,40,828,8,40,
        10,40,12,40,831,9,40,1,40,1,40,1,40,1,40,3,40,837,8,40,1,41,1,41,
        3,41,841,8,41,1,41,4,41,844,8,41,11,41,12,41,845,1,42,1,42,3,42,
        850,8,42,1,42,1,42,3,42,854,8,42,3,42,856,8,42,1,42,1,42,3,42,860,
        8,42,3,42,862,8,42,1,42,1,42,3,42,866,8,42,3,42,868,8,42,1,42,1,
        42,1,43,1,43,3,43,874,8,43,1,43,3,43,877,8,43,1,43,3,43,880,8,43,
        1,43,1,43,1,44,1,44,1,44,1,44,3,44,888,8,44,1,44,3,44,891,8,44,1,
        44,3,44,894,8,44,1,44,1,44,3,44,898,8,44,1,44,3,44,901,8,44,1,44,
        3,44,904,8,44,3,44,906,8,44,1,44,3,44,909,8,44,1,45,1,45,3,45,913,
        8,45,1,45,1,45,3,45,917,8,45,1,45,3,45,920,8,45,1,45,3,45,923,8,
        45,1,45,1,45,3,45,927,8,45,1,45,1,45,1,45,1,45,3,45,933,8,45,1,45,
        1,45,3,45,937,8,45,1,45,3,45,940,8,45,1,45,3,45,943,8,45,1,45,1,
        45,1,45,1,45,3,45,949,8,45,1,45,3,45,952,8,45,1,45,3,45,955,8,45,
        1,45,1,45,3,45,959,8,45,1,45,1,45,1,45,1,45,3,45,965,8,45,1,45,3,
        45,968,8,45,1,45,3,45,971,8,45,1,45,1,45,3,45,975,8,45,1,46,1,46,
        3,46,979,8,46,1,46,1,46,3,46,983,8,46,3,46,985,8,46,1,46,1,46,3,
        46,989,8,46,3,46,991,8,46,1,46,3,46,994,8,46,1,46,1,46,3,46,998,
        8,46,3,46,1000,8,46,1,46,1,46,1,47,1,47,3,47,1006,8,47,1,48,1,48,
        3,48,1010,8,48,1,48,1,48,3,48,1014,8,48,1,48,1,48,3,48,1018,8,48,
        1,48,3,48,1021,8,48,1,48,5,48,1024,8,48,10,48,12,48,1027,9,48,1,
        49,1,49,3,49,1031,8,49,1,49,5,49,1034,8,49,10,49,12,49,1037,9,49,
        1,50,1,50,3,50,1041,8,50,1,50,1,50,1,51,1,51,3,51,1047,8,51,1,51,
        1,51,3,51,1051,8,51,3,51,1053,8,51,1,51,1,51,3,51,1057,8,51,1,51,
        1,51,3,51,1061,8,51,3,51,1063,8,51,3,51,1065,8,51,1,52,1,52,1,53,
        1,53,1,54,1,54,3,54,1073,8,54,1,54,4,54,1076,8,54,11,54,12,54,1077,
        1,55,1,55,1,56,1,56,1,56,1,56,1,56,5,56,1087,8,56,10,56,12,56,1090,
        9,56,1,57,1,57,1,57,1,57,1,57,5,57,1097,8,57,10,57,12,57,1100,9,
        57,1,58,1,58,1,58,1,58,1,58,5,58,1107,8,58,10,58,12,58,1110,9,58,
        1,59,1,59,3,59,1114,8,59,5,59,1116,8,59,10,59,12,59,1119,9,59,1,
        59,1,59,1,60,1,60,3,60,1125,8,60,1,60,5,60,1128,8,60,10,60,12,60,
        1131,9,60,1,61,1,61,3,61,1135,8,61,1,61,1,61,1,61,3,61,1140,8,61,
        1,61,1,61,1,61,3,61,1145,8,61,1,61,1,61,1,61,3,61,1150,8,61,1,61,
        1,61,1,61,3,61,1155,8,61,1,61,1,61,1,61,3,61,1160,8,61,1,61,3,61,
        1163,8,61,1,62,1,62,1,62,1,62,5,62,1169,8,62,10,62,12,62,1172,9,
        62,1,63,1,63,1,63,1,63,1,63,1,63,1,63,1,63,1,63,1,63,1,63,3,63,1185,
        8,63,1,63,3,63,1188,8,63,1,63,3,63,1191,8,63,1,63,1,63,1,64,1,64,
        1,64,3,64,1198,8,64,1,64,1,64,1,65,1,65,1,65,1,65,1,65,1,65,1,65,
        1,65,1,65,1,65,3,65,1212,8,65,1,66,1,66,3,66,1216,8,66,1,66,1,66,
        3,66,1220,8,66,1,66,1,66,3,66,1224,8,66,1,66,1,66,3,66,1228,8,66,
        1,66,5,66,1231,8,66,10,66,12,66,1234,9,66,1,67,1,67,3,67,1238,8,
        67,1,67,1,67,3,67,1242,8,67,1,67,1,67,3,67,1246,8,67,1,67,1,67,3,
        67,1250,8,67,1,67,1,67,3,67,1254,8,67,1,67,1,67,3,67,1258,8,67,1,
        67,5,67,1261,8,67,10,67,12,67,1264,9,67,1,68,1,68,3,68,1268,8,68,
        1,68,1,68,3,68,1272,8,68,1,68,5,68,1275,8,68,10,68,12,68,1278,9,
        68,1,69,1,69,1,69,3,69,1283,8,69,1,69,3,69,1286,8,69,1,70,1,70,3,
        70,1290,8,70,1,70,1,70,3,70,1294,8,70,1,70,5,70,1297,8,70,10,70,
        12,70,1300,9,70,1,70,3,70,1303,8,70,1,70,3,70,1306,8,70,1,71,1,71,
        1,71,1,71,1,71,1,71,3,71,1314,8,71,1,71,1,71,3,71,1318,8,71,1,71,
        3,71,1321,8,71,1,72,1,72,3,72,1325,8,72,1,72,1,72,1,73,1,73,1,73,
        1,73,1,73,1,73,3,73,1335,8,73,1,73,1,73,3,73,1339,8,73,1,73,1,73,
        3,73,1343,8,73,1,73,1,73,1,73,1,73,1,73,1,73,1,73,1,73,1,73,1,73,
        1,73,3,73,1356,8,73,1,74,1,74,3,74,1360,8,74,1,74,1,74,3,74,1364,
        8,74,1,74,1,74,3,74,1368,8,74,1,74,1,74,3,74,1372,8,74,1,74,1,74,
        3,74,1376,8,74,1,74,1,74,3,74,1380,8,74,1,74,1,74,3,74,1384,8,74,
        1,74,1,74,3,74,1388,8,74,1,74,1,74,3,74,1392,8,74,1,74,1,74,1,75,
        1,75,3,75,1398,8,75,1,75,1,75,3,75,1402,8,75,1,75,1,75,3,75,1406,
        8,75,1,75,1,75,3,75,1410,8,75,1,75,1,75,3,75,1414,8,75,5,75,1416,
        8,75,10,75,12,75,1419,9,75,3,75,1421,8,75,1,75,1,75,1,76,1,76,3,
        76,1427,8,76,1,76,1,76,3,76,1431,8,76,1,76,1,76,1,76,1,76,3,76,1437,
        8,76,1,76,1,76,1,76,3,76,1442,8,76,1,76,1,76,3,76,1446,8,76,1,77,
        1,77,3,77,1450,8,77,1,77,4,77,1453,8,77,11,77,12,77,1454,1,77,1,
        77,3,77,1459,8,77,1,77,1,77,3,77,1463,8,77,1,77,4,77,1466,8,77,11,
        77,12,77,1467,3,77,1470,8,77,1,77,3,77,1473,8,77,1,77,1,77,3,77,
        1477,8,77,1,77,3,77,1480,8,77,1,77,3,77,1483,8,77,1,77,1,77,1,78,
        1,78,3,78,1489,8,78,1,78,1,78,3,78,1493,8,78,1,78,1,78,3,78,1497,
        8,78,1,78,1,78,1,79,1,79,3,79,1503,8,79,1,79,1,79,3,79,1507,8,79,
        1,79,1,79,3,79,1511,8,79,1,79,3,79,1514,8,79,1,79,3,79,1517,8,79,
        1,79,1,79,1,80,1,80,3,80,1523,8,80,1,80,1,80,3,80,1527,8,80,1,80,
        1,80,3,80,1531,8,80,3,80,1533,8,80,1,80,1,80,3,80,1537,8,80,1,80,
        1,80,3,80,1541,8,80,3,80,1543,8,80,1,80,1,80,3,80,1547,8,80,1,80,
        1,80,3,80,1551,8,80,1,80,1,80,1,81,1,81,3,81,1557,8,81,1,81,1,81,
        3,81,1561,8,81,1,81,1,81,3,81,1565,8,81,1,81,1,81,1,81,1,81,3,81,
        1571,8,81,1,81,1,81,3,81,1575,8,81,1,81,1,81,3,81,1579,8,81,1,81,
        1,81,1,81,1,81,3,81,1585,8,81,1,81,1,81,3,81,1589,8,81,1,81,1,81,
        3,81,1593,8,81,1,81,1,81,1,81,1,81,3,81,1599,8,81,1,81,1,81,3,81,
        1603,8,81,1,81,1,81,3,81,1607,8,81,1,81,1,81,3,81,1611,8,81,1,82,
        1,82,3,82,1615,8,82,1,82,3,82,1618,8,82,1,83,1,83,1,84,1,84,3,84,
        1624,8,84,1,84,1,84,3,84,1628,8,84,1,84,1,84,1,85,1,85,1,85,1,85,
        1,85,1,85,1,86,1,86,3,86,1640,8,86,1,86,1,86,3,86,1644,8,86,1,86,
        1,86,3,86,1648,8,86,3,86,1650,8,86,1,86,1,86,3,86,1654,8,86,1,86,
        1,86,3,86,1658,8,86,1,86,1,86,3,86,1662,8,86,5,86,1664,8,86,10,86,
        12,86,1667,9,86,3,86,1669,8,86,1,86,1,86,1,87,1,87,1,87,1,88,1,88,
        3,88,1678,8,88,1,88,1,88,3,88,1682,8,88,1,88,1,88,1,88,1,88,3,88,
        1688,8,88,1,88,3,88,1691,8,88,3,88,1693,8,88,1,88,3,88,1696,8,88,
        1,88,1,88,1,89,1,89,3,89,1702,8,89,1,89,1,89,3,89,1706,8,89,1,89,
        1,89,1,89,1,89,3,89,1712,8,89,1,89,3,89,1715,8,89,3,89,1717,8,89,
        1,89,3,89,1720,8,89,1,89,1,89,1,90,1,90,3,90,1726,8,90,1,90,5,90,
        1729,8,90,10,90,12,90,1732,9,90,1,91,1,91,3,91,1736,8,91,1,91,1,
        91,3,91,1740,8,91,1,91,1,91,3,91,1744,8,91,1,91,1,91,3,91,1748,8,
        91,1,91,1,91,3,91,1752,8,91,5,91,1754,8,91,10,91,12,91,1757,9,91,
        3,91,1759,8,91,1,91,1,91,1,92,1,92,1,93,1,93,1,94,1,94,1,94,1,95,
        1,95,1,95,5,95,1773,8,95,10,95,12,95,1776,9,95,1,96,1,96,1,97,1,
        97,1,97,1,97,1,97,1,97,3,97,1786,8,97,1,98,1,98,1,99,1,99,3,99,1792,
        8,99,1,100,1,100,1,101,1,101,1,102,1,102,3,102,1800,8,102,1,102,
        1,102,3,102,1804,8,102,1,102,1,102,3,102,1808,8,102,1,102,1,102,
        3,102,1812,8,102,5,102,1814,8,102,10,102,12,102,1817,9,102,3,102,
        1819,8,102,1,102,1,102,1,103,1,103,3,103,1825,8,103,1,103,1,103,
        3,103,1829,8,103,1,103,1,103,3,103,1833,8,103,1,103,1,103,3,103,
        1837,8,103,1,103,1,103,3,103,1841,8,103,1,103,1,103,3,103,1845,8,
        103,1,103,1,103,3,103,1849,8,103,1,103,1,103,3,103,1853,8,103,5,
        103,1855,8,103,10,103,12,103,1858,9,103,3,103,1860,8,103,1,103,1,
        103,1,104,1,104,1,105,1,105,1,105,3,105,1869,8,105,1,106,1,106,3,
        106,1873,8,106,1,107,1,107,1,108,1,108,1,109,1,109,1,110,1,110,1,
        111,1,111,1,111,0,0,112,0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,
        30,32,34,36,38,40,42,44,46,48,50,52,54,56,58,60,62,64,66,68,70,72,
        74,76,78,80,82,84,86,88,90,92,94,96,98,100,102,104,106,108,110,112,
        114,116,118,120,122,124,126,128,130,132,134,136,138,140,142,144,
        146,148,150,152,154,156,158,160,162,164,166,168,170,172,174,176,
        178,180,182,184,186,188,190,192,194,196,198,200,202,204,206,208,
        210,212,214,216,218,220,222,0,11,1,0,51,52,1,0,73,76,2,0,11,11,22,
        22,1,0,101,102,1,0,103,105,1,0,113,114,7,0,47,48,53,63,66,77,80,
        89,92,96,100,102,117,126,8,0,49,52,78,79,90,91,97,99,106,106,124,
        124,127,129,132,132,2,0,17,17,28,31,2,0,18,18,32,35,2,0,22,22,36,
        46,2175,0,225,1,0,0,0,2,239,1,0,0,0,4,243,1,0,0,0,6,245,1,0,0,0,
        8,267,1,0,0,0,10,271,1,0,0,0,12,308,1,0,0,0,14,332,1,0,0,0,16,345,
        1,0,0,0,18,347,1,0,0,0,20,381,1,0,0,0,22,385,1,0,0,0,24,447,1,0,
        0,0,26,460,1,0,0,0,28,470,1,0,0,0,30,492,1,0,0,0,32,494,1,0,0,0,
        34,500,1,0,0,0,36,554,1,0,0,0,38,558,1,0,0,0,40,578,1,0,0,0,42,598,
        1,0,0,0,44,600,1,0,0,0,46,611,1,0,0,0,48,628,1,0,0,0,50,653,1,0,
        0,0,52,657,1,0,0,0,54,665,1,0,0,0,56,672,1,0,0,0,58,716,1,0,0,0,
        60,725,1,0,0,0,62,727,1,0,0,0,64,742,1,0,0,0,66,746,1,0,0,0,68,750,
        1,0,0,0,70,757,1,0,0,0,72,761,1,0,0,0,74,786,1,0,0,0,76,790,1,0,
        0,0,78,820,1,0,0,0,80,836,1,0,0,0,82,838,1,0,0,0,84,847,1,0,0,0,
        86,871,1,0,0,0,88,908,1,0,0,0,90,974,1,0,0,0,92,976,1,0,0,0,94,1005,
        1,0,0,0,96,1007,1,0,0,0,98,1028,1,0,0,0,100,1038,1,0,0,0,102,1044,
        1,0,0,0,104,1066,1,0,0,0,106,1068,1,0,0,0,108,1070,1,0,0,0,110,1079,
        1,0,0,0,112,1081,1,0,0,0,114,1091,1,0,0,0,116,1101,1,0,0,0,118,1117,
        1,0,0,0,120,1122,1,0,0,0,122,1162,1,0,0,0,124,1164,1,0,0,0,126,1187,
        1,0,0,0,128,1194,1,0,0,0,130,1211,1,0,0,0,132,1213,1,0,0,0,134,1235,
        1,0,0,0,136,1265,1,0,0,0,138,1285,1,0,0,0,140,1287,1,0,0,0,142,1320,
        1,0,0,0,144,1322,1,0,0,0,146,1355,1,0,0,0,148,1357,1,0,0,0,150,1395,
        1,0,0,0,152,1445,1,0,0,0,154,1469,1,0,0,0,156,1486,1,0,0,0,158,1500,
        1,0,0,0,160,1520,1,0,0,0,162,1610,1,0,0,0,164,1612,1,0,0,0,166,1619,
        1,0,0,0,168,1621,1,0,0,0,170,1631,1,0,0,0,172,1637,1,0,0,0,174,1672,
        1,0,0,0,176,1675,1,0,0,0,178,1699,1,0,0,0,180,1723,1,0,0,0,182,1733,
        1,0,0,0,184,1762,1,0,0,0,186,1764,1,0,0,0,188,1766,1,0,0,0,190,1774,
        1,0,0,0,192,1777,1,0,0,0,194,1785,1,0,0,0,196,1787,1,0,0,0,198,1791,
        1,0,0,0,200,1793,1,0,0,0,202,1795,1,0,0,0,204,1797,1,0,0,0,206,1822,
        1,0,0,0,208,1863,1,0,0,0,210,1865,1,0,0,0,212,1872,1,0,0,0,214,1874,
        1,0,0,0,216,1876,1,0,0,0,218,1878,1,0,0,0,220,1880,1,0,0,0,222,1882,
        1,0,0,0,224,226,5,133,0,0,225,224,1,0,0,0,225,226,1,0,0,0,226,227,
        1,0,0,0,227,232,3,2,1,0,228,230,5,133,0,0,229,228,1,0,0,0,229,230,
        1,0,0,0,230,231,1,0,0,0,231,233,5,1,0,0,232,229,1,0,0,0,232,233,
        1,0,0,0,233,235,1,0,0,0,234,236,5,133,0,0,235,234,1,0,0,0,235,236,
        1,0,0,0,236,237,1,0,0,0,237,238,5,0,0,1,238,1,1,0,0,0,239,240,3,
        4,2,0,240,3,1,0,0,0,241,244,3,6,3,0,242,244,3,46,23,0,243,241,1,
        0,0,0,243,242,1,0,0,0,244,5,1,0,0,0,245,252,3,10,5,0,246,248,5,133,
        0,0,247,246,1,0,0,0,247,248,1,0,0,0,248,249,1,0,0,0,249,251,3,8,
        4,0,250,247,1,0,0,0,251,254,1,0,0,0,252,250,1,0,0,0,252,253,1,0,
        0,0,253,7,1,0,0,0,254,252,1,0,0,0,255,256,5,47,0,0,256,257,5,133,
        0,0,257,259,5,48,0,0,258,260,5,133,0,0,259,258,1,0,0,0,259,260,1,
        0,0,0,260,261,1,0,0,0,261,268,3,10,5,0,262,264,5,47,0,0,263,265,
        5,133,0,0,264,263,1,0,0,0,264,265,1,0,0,0,265,266,1,0,0,0,266,268,
        3,10,5,0,267,255,1,0,0,0,267,262,1,0,0,0,268,9,1,0,0,0,269,272,3,
        12,6,0,270,272,3,14,7,0,271,269,1,0,0,0,271,270,1,0,0,0,272,11,1,
        0,0,0,273,275,3,20,10,0,274,276,5,133,0,0,275,274,1,0,0,0,275,276,
        1,0,0,0,276,278,1,0,0,0,277,273,1,0,0,0,278,281,1,0,0,0,279,277,
        1,0,0,0,279,280,1,0,0,0,280,282,1,0,0,0,281,279,1,0,0,0,282,309,
        3,54,27,0,283,285,3,20,10,0,284,286,5,133,0,0,285,284,1,0,0,0,285,
        286,1,0,0,0,286,288,1,0,0,0,287,283,1,0,0,0,288,291,1,0,0,0,289,
        287,1,0,0,0,289,290,1,0,0,0,290,292,1,0,0,0,291,289,1,0,0,0,292,
        299,3,16,8,0,293,295,5,133,0,0,294,293,1,0,0,0,294,295,1,0,0,0,295,
        296,1,0,0,0,296,298,3,16,8,0,297,294,1,0,0,0,298,301,1,0,0,0,299,
        297,1,0,0,0,299,300,1,0,0,0,300,306,1,0,0,0,301,299,1,0,0,0,302,
        304,5,133,0,0,303,302,1,0,0,0,303,304,1,0,0,0,304,305,1,0,0,0,305,
        307,3,54,27,0,306,303,1,0,0,0,306,307,1,0,0,0,307,309,1,0,0,0,308,
        279,1,0,0,0,308,289,1,0,0,0,309,13,1,0,0,0,310,312,3,20,10,0,311,
        313,5,133,0,0,312,311,1,0,0,0,312,313,1,0,0,0,313,315,1,0,0,0,314,
        310,1,0,0,0,315,318,1,0,0,0,316,314,1,0,0,0,316,317,1,0,0,0,317,
        325,1,0,0,0,318,316,1,0,0,0,319,321,3,16,8,0,320,322,5,133,0,0,321,
        320,1,0,0,0,321,322,1,0,0,0,322,324,1,0,0,0,323,319,1,0,0,0,324,
        327,1,0,0,0,325,323,1,0,0,0,325,326,1,0,0,0,326,328,1,0,0,0,327,
        325,1,0,0,0,328,330,3,52,26,0,329,331,5,133,0,0,330,329,1,0,0,0,
        330,331,1,0,0,0,331,333,1,0,0,0,332,316,1,0,0,0,333,334,1,0,0,0,
        334,332,1,0,0,0,334,335,1,0,0,0,335,336,1,0,0,0,336,337,3,12,6,0,
        337,15,1,0,0,0,338,346,3,32,16,0,339,346,3,28,14,0,340,346,3,38,
        19,0,341,346,3,34,17,0,342,346,3,40,20,0,343,346,3,18,9,0,344,346,
        3,22,11,0,345,338,1,0,0,0,345,339,1,0,0,0,345,340,1,0,0,0,345,341,
        1,0,0,0,345,342,1,0,0,0,345,343,1,0,0,0,345,344,1,0,0,0,346,17,1,
        0,0,0,347,349,5,49,0,0,348,350,5,133,0,0,349,348,1,0,0,0,349,350,
        1,0,0,0,350,351,1,0,0,0,351,353,5,2,0,0,352,354,5,133,0,0,353,352,
        1,0,0,0,353,354,1,0,0,0,354,355,1,0,0,0,355,356,3,192,96,0,356,357,
        5,133,0,0,357,358,5,87,0,0,358,359,5,133,0,0,359,361,3,110,55,0,
        360,362,5,133,0,0,361,360,1,0,0,0,361,362,1,0,0,0,362,363,1,0,0,
        0,363,368,5,3,0,0,364,366,5,133,0,0,365,364,1,0,0,0,365,366,1,0,
        0,0,366,367,1,0,0,0,367,369,3,16,8,0,368,365,1,0,0,0,369,370,1,0,
        0,0,370,368,1,0,0,0,370,371,1,0,0,0,371,373,1,0,0,0,372,374,5,133,
        0,0,373,372,1,0,0,0,373,374,1,0,0,0,374,375,1,0,0,0,375,376,5,4,
        0,0,376,19,1,0,0,0,377,382,3,24,12,0,378,382,3,26,13,0,379,382,3,
        22,11,0,380,382,3,44,22,0,381,377,1,0,0,0,381,378,1,0,0,0,381,379,
        1,0,0,0,381,380,1,0,0,0,382,21,1,0,0,0,383,384,5,53,0,0,384,386,
        5,133,0,0,385,383,1,0,0,0,385,386,1,0,0,0,386,387,1,0,0,0,387,389,
        5,64,0,0,388,390,5,133,0,0,389,388,1,0,0,0,389,390,1,0,0,0,390,419,
        1,0,0,0,391,393,5,2,0,0,392,394,5,133,0,0,393,392,1,0,0,0,393,394,
        1,0,0,0,394,410,1,0,0,0,395,411,5,5,0,0,396,407,3,192,96,0,397,399,
        5,133,0,0,398,397,1,0,0,0,398,399,1,0,0,0,399,400,1,0,0,0,400,402,
        5,6,0,0,401,403,5,133,0,0,402,401,1,0,0,0,402,403,1,0,0,0,403,404,
        1,0,0,0,404,406,3,192,96,0,405,398,1,0,0,0,406,409,1,0,0,0,407,405,
        1,0,0,0,407,408,1,0,0,0,408,411,1,0,0,0,409,407,1,0,0,0,410,395,
        1,0,0,0,410,396,1,0,0,0,410,411,1,0,0,0,411,413,1,0,0,0,412,414,
        5,133,0,0,413,412,1,0,0,0,413,414,1,0,0,0,414,415,1,0,0,0,415,417,
        5,4,0,0,416,418,5,133,0,0,417,416,1,0,0,0,417,418,1,0,0,0,418,420,
        1,0,0,0,419,391,1,0,0,0,419,420,1,0,0,0,420,421,1,0,0,0,421,423,
        5,7,0,0,422,424,5,133,0,0,423,422,1,0,0,0,423,424,1,0,0,0,424,425,
        1,0,0,0,425,427,3,6,3,0,426,428,5,133,0,0,427,426,1,0,0,0,427,428,
        1,0,0,0,428,429,1,0,0,0,429,443,5,8,0,0,430,431,5,133,0,0,431,432,
        5,87,0,0,432,433,5,133,0,0,433,441,5,50,0,0,434,435,5,133,0,0,435,
        436,5,124,0,0,436,437,5,133,0,0,437,438,3,110,55,0,438,439,5,133,
        0,0,439,440,7,0,0,0,440,442,1,0,0,0,441,434,1,0,0,0,441,442,1,0,
        0,0,442,444,1,0,0,0,443,430,1,0,0,0,443,444,1,0,0,0,444,23,1,0,0,
        0,445,446,5,53,0,0,446,448,5,133,0,0,447,445,1,0,0,0,447,448,1,0,
        0,0,448,449,1,0,0,0,449,451,5,54,0,0,450,452,5,133,0,0,451,450,1,
        0,0,0,451,452,1,0,0,0,452,453,1,0,0,0,453,458,3,72,36,0,454,456,
        5,133,0,0,455,454,1,0,0,0,455,456,1,0,0,0,456,457,1,0,0,0,457,459,
        3,70,35,0,458,455,1,0,0,0,458,459,1,0,0,0,459,25,1,0,0,0,460,462,
        5,55,0,0,461,463,5,133,0,0,462,461,1,0,0,0,462,463,1,0,0,0,463,464,
        1,0,0,0,464,465,3,110,55,0,465,466,5,133,0,0,466,467,5,56,0,0,467,
        468,5,133,0,0,468,469,3,192,96,0,469,27,1,0,0,0,470,472,5,57,0,0,
        471,473,5,133,0,0,472,471,1,0,0,0,472,473,1,0,0,0,473,474,1,0,0,
        0,474,479,3,74,37,0,475,476,5,133,0,0,476,478,3,30,15,0,477,475,
        1,0,0,0,478,481,1,0,0,0,479,477,1,0,0,0,479,480,1,0,0,0,480,29,1,
        0,0,0,481,479,1,0,0,0,482,483,5,58,0,0,483,484,5,133,0,0,484,485,
        5,54,0,0,485,486,5,133,0,0,486,493,3,34,17,0,487,488,5,58,0,0,488,
        489,5,133,0,0,489,490,5,59,0,0,490,491,5,133,0,0,491,493,3,34,17,
        0,492,482,1,0,0,0,492,487,1,0,0,0,493,31,1,0,0,0,494,496,5,59,0,
        0,495,497,5,133,0,0,496,495,1,0,0,0,496,497,1,0,0,0,497,498,1,0,
        0,0,498,499,3,72,36,0,499,33,1,0,0,0,500,502,5,60,0,0,501,503,5,
        133,0,0,502,501,1,0,0,0,502,503,1,0,0,0,503,504,1,0,0,0,504,515,
        3,36,18,0,505,507,5,133,0,0,506,505,1,0,0,0,506,507,1,0,0,0,507,
        508,1,0,0,0,508,510,5,6,0,0,509,511,5,133,0,0,510,509,1,0,0,0,510,
        511,1,0,0,0,511,512,1,0,0,0,512,514,3,36,18,0,513,506,1,0,0,0,514,
        517,1,0,0,0,515,513,1,0,0,0,515,516,1,0,0,0,516,35,1,0,0,0,517,515,
        1,0,0,0,518,520,3,108,54,0,519,521,5,133,0,0,520,519,1,0,0,0,520,
        521,1,0,0,0,521,522,1,0,0,0,522,524,5,9,0,0,523,525,5,133,0,0,524,
        523,1,0,0,0,524,525,1,0,0,0,525,526,1,0,0,0,526,527,3,110,55,0,527,
        555,1,0,0,0,528,530,3,192,96,0,529,531,5,133,0,0,530,529,1,0,0,0,
        530,531,1,0,0,0,531,532,1,0,0,0,532,534,5,9,0,0,533,535,5,133,0,
        0,534,533,1,0,0,0,534,535,1,0,0,0,535,536,1,0,0,0,536,537,3,110,
        55,0,537,555,1,0,0,0,538,540,3,192,96,0,539,541,5,133,0,0,540,539,
        1,0,0,0,540,541,1,0,0,0,541,542,1,0,0,0,542,544,5,10,0,0,543,545,
        5,133,0,0,544,543,1,0,0,0,544,545,1,0,0,0,545,546,1,0,0,0,546,547,
        3,110,55,0,547,555,1,0,0,0,548,550,3,192,96,0,549,551,5,133,0,0,
        550,549,1,0,0,0,550,551,1,0,0,0,551,552,1,0,0,0,552,553,3,98,49,
        0,553,555,1,0,0,0,554,518,1,0,0,0,554,528,1,0,0,0,554,538,1,0,0,
        0,554,548,1,0,0,0,555,37,1,0,0,0,556,557,5,61,0,0,557,559,5,133,
        0,0,558,556,1,0,0,0,558,559,1,0,0,0,559,560,1,0,0,0,560,562,5,62,
        0,0,561,563,5,133,0,0,562,561,1,0,0,0,562,563,1,0,0,0,563,564,1,
        0,0,0,564,575,3,110,55,0,565,567,5,133,0,0,566,565,1,0,0,0,566,567,
        1,0,0,0,567,568,1,0,0,0,568,570,5,6,0,0,569,571,5,133,0,0,570,569,
        1,0,0,0,570,571,1,0,0,0,571,572,1,0,0,0,572,574,3,110,55,0,573,566,
        1,0,0,0,574,577,1,0,0,0,575,573,1,0,0,0,575,576,1,0,0,0,576,39,1,
        0,0,0,577,575,1,0,0,0,578,579,5,63,0,0,579,580,5,133,0,0,580,591,
        3,42,21,0,581,583,5,133,0,0,582,581,1,0,0,0,582,583,1,0,0,0,583,
        584,1,0,0,0,584,586,5,6,0,0,585,587,5,133,0,0,586,585,1,0,0,0,586,
        587,1,0,0,0,587,588,1,0,0,0,588,590,3,42,21,0,589,582,1,0,0,0,590,
        593,1,0,0,0,591,589,1,0,0,0,591,592,1,0,0,0,592,41,1,0,0,0,593,591,
        1,0,0,0,594,595,3,192,96,0,595,596,3,98,49,0,596,599,1,0,0,0,597,
        599,3,108,54,0,598,594,1,0,0,0,598,597,1,0,0,0,599,43,1,0,0,0,600,
        601,5,64,0,0,601,602,5,133,0,0,602,609,3,182,91,0,603,605,5,133,
        0,0,604,603,1,0,0,0,604,605,1,0,0,0,605,606,1,0,0,0,606,607,5,65,
        0,0,607,608,5,133,0,0,608,610,3,48,24,0,609,604,1,0,0,0,609,610,
        1,0,0,0,610,45,1,0,0,0,611,612,5,64,0,0,612,615,5,133,0,0,613,616,
        3,182,91,0,614,616,3,184,92,0,615,613,1,0,0,0,615,614,1,0,0,0,616,
        626,1,0,0,0,617,619,5,133,0,0,618,617,1,0,0,0,618,619,1,0,0,0,619,
        620,1,0,0,0,620,621,5,65,0,0,621,624,5,133,0,0,622,625,5,5,0,0,623,
        625,3,48,24,0,624,622,1,0,0,0,624,623,1,0,0,0,625,627,1,0,0,0,626,
        618,1,0,0,0,626,627,1,0,0,0,627,47,1,0,0,0,628,639,3,50,25,0,629,
        631,5,133,0,0,630,629,1,0,0,0,630,631,1,0,0,0,631,632,1,0,0,0,632,
        634,5,6,0,0,633,635,5,133,0,0,634,633,1,0,0,0,634,635,1,0,0,0,635,
        636,1,0,0,0,636,638,3,50,25,0,637,630,1,0,0,0,638,641,1,0,0,0,639,
        637,1,0,0,0,639,640,1,0,0,0,640,646,1,0,0,0,641,639,1,0,0,0,642,
        644,5,133,0,0,643,642,1,0,0,0,643,644,1,0,0,0,644,645,1,0,0,0,645,
        647,3,70,35,0,646,643,1,0,0,0,646,647,1,0,0,0,647,49,1,0,0,0,648,
        649,3,186,93,0,649,650,5,133,0,0,650,651,5,56,0,0,651,652,5,133,
        0,0,652,654,1,0,0,0,653,648,1,0,0,0,653,654,1,0,0,0,654,655,1,0,
        0,0,655,656,3,192,96,0,656,51,1,0,0,0,657,658,5,66,0,0,658,663,3,
        56,28,0,659,661,5,133,0,0,660,659,1,0,0,0,660,661,1,0,0,0,661,662,
        1,0,0,0,662,664,3,70,35,0,663,660,1,0,0,0,663,664,1,0,0,0,664,53,
        1,0,0,0,665,666,5,67,0,0,666,667,3,56,28,0,667,55,1,0,0,0,668,670,
        5,133,0,0,669,668,1,0,0,0,669,670,1,0,0,0,670,671,1,0,0,0,671,673,
        5,68,0,0,672,669,1,0,0,0,672,673,1,0,0,0,673,674,1,0,0,0,674,675,
        5,133,0,0,675,678,3,58,29,0,676,677,5,133,0,0,677,679,3,62,31,0,
        678,676,1,0,0,0,678,679,1,0,0,0,679,682,1,0,0,0,680,681,5,133,0,
        0,681,683,3,64,32,0,682,680,1,0,0,0,682,683,1,0,0,0,683,686,1,0,
        0,0,684,685,5,133,0,0,685,687,3,66,33,0,686,684,1,0,0,0,686,687,
        1,0,0,0,687,57,1,0,0,0,688,699,5,5,0,0,689,691,5,133,0,0,690,689,
        1,0,0,0,690,691,1,0,0,0,691,692,1,0,0,0,692,694,5,6,0,0,693,695,
        5,133,0,0,694,693,1,0,0,0,694,695,1,0,0,0,695,696,1,0,0,0,696,698,
        3,60,30,0,697,690,1,0,0,0,698,701,1,0,0,0,699,697,1,0,0,0,699,700,
        1,0,0,0,700,717,1,0,0,0,701,699,1,0,0,0,702,713,3,60,30,0,703,705,
        5,133,0,0,704,703,1,0,0,0,704,705,1,0,0,0,705,706,1,0,0,0,706,708,
        5,6,0,0,707,709,5,133,0,0,708,707,1,0,0,0,708,709,1,0,0,0,709,710,
        1,0,0,0,710,712,3,60,30,0,711,704,1,0,0,0,712,715,1,0,0,0,713,711,
        1,0,0,0,713,714,1,0,0,0,714,717,1,0,0,0,715,713,1,0,0,0,716,688,
        1,0,0,0,716,702,1,0,0,0,717,59,1,0,0,0,718,719,3,110,55,0,719,720,
        5,133,0,0,720,721,5,56,0,0,721,722,5,133,0,0,722,723,3,192,96,0,
        723,726,1,0,0,0,724,726,3,110,55,0,725,718,1,0,0,0,725,724,1,0,0,
        0,726,61,1,0,0,0,727,728,5,69,0,0,728,729,5,133,0,0,729,730,5,70,
        0,0,730,731,5,133,0,0,731,739,3,68,34,0,732,734,5,6,0,0,733,735,
        5,133,0,0,734,733,1,0,0,0,734,735,1,0,0,0,735,736,1,0,0,0,736,738,
        3,68,34,0,737,732,1,0,0,0,738,741,1,0,0,0,739,737,1,0,0,0,739,740,
        1,0,0,0,740,63,1,0,0,0,741,739,1,0,0,0,742,743,5,71,0,0,743,744,
        5,133,0,0,744,745,3,110,55,0,745,65,1,0,0,0,746,747,5,72,0,0,747,
        748,5,133,0,0,748,749,3,110,55,0,749,67,1,0,0,0,750,755,3,110,55,
        0,751,753,5,133,0,0,752,751,1,0,0,0,752,753,1,0,0,0,753,754,1,0,
        0,0,754,756,7,1,0,0,755,752,1,0,0,0,755,756,1,0,0,0,756,69,1,0,0,
        0,757,758,5,77,0,0,758,759,5,133,0,0,759,760,3,110,55,0,760,71,1,
        0,0,0,761,772,3,74,37,0,762,764,5,133,0,0,763,762,1,0,0,0,763,764,
        1,0,0,0,764,765,1,0,0,0,765,767,5,6,0,0,766,768,5,133,0,0,767,766,
        1,0,0,0,767,768,1,0,0,0,768,769,1,0,0,0,769,771,3,74,37,0,770,763,
        1,0,0,0,771,774,1,0,0,0,772,770,1,0,0,0,772,773,1,0,0,0,773,73,1,
        0,0,0,774,772,1,0,0,0,775,777,3,192,96,0,776,778,5,133,0,0,777,776,
        1,0,0,0,777,778,1,0,0,0,778,779,1,0,0,0,779,781,5,9,0,0,780,782,
        5,133,0,0,781,780,1,0,0,0,781,782,1,0,0,0,782,783,1,0,0,0,783,784,
        3,76,38,0,784,787,1,0,0,0,785,787,3,76,38,0,786,775,1,0,0,0,786,
        785,1,0,0,0,787,75,1,0,0,0,788,791,3,78,39,0,789,791,3,80,40,0,790,
        788,1,0,0,0,790,789,1,0,0,0,791,77,1,0,0,0,792,794,5,78,0,0,793,
        795,5,133,0,0,794,793,1,0,0,0,794,795,1,0,0,0,795,796,1,0,0,0,796,
        798,5,2,0,0,797,799,5,133,0,0,798,797,1,0,0,0,798,799,1,0,0,0,799,
        800,1,0,0,0,800,802,3,80,40,0,801,803,5,133,0,0,802,801,1,0,0,0,
        802,803,1,0,0,0,803,804,1,0,0,0,804,805,5,4,0,0,805,821,1,0,0,0,
        806,808,5,79,0,0,807,809,5,133,0,0,808,807,1,0,0,0,808,809,1,0,0,
        0,809,810,1,0,0,0,810,812,5,2,0,0,811,813,5,133,0,0,812,811,1,0,
        0,0,812,813,1,0,0,0,813,814,1,0,0,0,814,816,3,80,40,0,815,817,5,
        133,0,0,816,815,1,0,0,0,816,817,1,0,0,0,817,818,1,0,0,0,818,819,
        5,4,0,0,819,821,1,0,0,0,820,792,1,0,0,0,820,806,1,0,0,0,821,79,1,
        0,0,0,822,829,3,84,42,0,823,825,5,133,0,0,824,823,1,0,0,0,824,825,
        1,0,0,0,825,826,1,0,0,0,826,828,3,86,43,0,827,824,1,0,0,0,828,831,
        1,0,0,0,829,827,1,0,0,0,829,830,1,0,0,0,830,837,1,0,0,0,831,829,
        1,0,0,0,832,833,5,2,0,0,833,834,3,80,40,0,834,835,5,4,0,0,835,837,
        1,0,0,0,836,822,1,0,0,0,836,832,1,0,0,0,837,81,1,0,0,0,838,843,3,
        84,42,0,839,841,5,133,0,0,840,839,1,0,0,0,840,841,1,0,0,0,841,842,
        1,0,0,0,842,844,3,86,43,0,843,840,1,0,0,0,844,845,1,0,0,0,845,843,
        1,0,0,0,845,846,1,0,0,0,846,83,1,0,0,0,847,849,5,2,0,0,848,850,5,
        133,0,0,849,848,1,0,0,0,849,850,1,0,0,0,850,855,1,0,0,0,851,853,
        3,192,96,0,852,854,5,133,0,0,853,852,1,0,0,0,853,854,1,0,0,0,854,
        856,1,0,0,0,855,851,1,0,0,0,855,856,1,0,0,0,856,861,1,0,0,0,857,
        859,3,98,49,0,858,860,5,133,0,0,859,858,1,0,0,0,859,860,1,0,0,0,
        860,862,1,0,0,0,861,857,1,0,0,0,861,862,1,0,0,0,862,867,1,0,0,0,
        863,865,3,94,47,0,864,866,5,133,0,0,865,864,1,0,0,0,865,866,1,0,
        0,0,866,868,1,0,0,0,867,863,1,0,0,0,867,868,1,0,0,0,868,869,1,0,
        0,0,869,870,5,4,0,0,870,85,1,0,0,0,871,876,3,90,45,0,872,874,5,133,
        0,0,873,872,1,0,0,0,873,874,1,0,0,0,874,875,1,0,0,0,875,877,3,88,
        44,0,876,873,1,0,0,0,876,877,1,0,0,0,877,879,1,0,0,0,878,880,5,133,
        0,0,879,878,1,0,0,0,879,880,1,0,0,0,880,881,1,0,0,0,881,882,3,84,
        42,0,882,87,1,0,0,0,883,909,5,11,0,0,884,909,5,5,0,0,885,887,5,7,
        0,0,886,888,5,133,0,0,887,886,1,0,0,0,887,888,1,0,0,0,888,890,1,
        0,0,0,889,891,3,200,100,0,890,889,1,0,0,0,890,891,1,0,0,0,891,893,
        1,0,0,0,892,894,5,133,0,0,893,892,1,0,0,0,893,894,1,0,0,0,894,905,
        1,0,0,0,895,897,5,6,0,0,896,898,5,133,0,0,897,896,1,0,0,0,897,898,
        1,0,0,0,898,900,1,0,0,0,899,901,3,200,100,0,900,899,1,0,0,0,900,
        901,1,0,0,0,901,903,1,0,0,0,902,904,5,133,0,0,903,902,1,0,0,0,903,
        904,1,0,0,0,904,906,1,0,0,0,905,895,1,0,0,0,905,906,1,0,0,0,906,
        907,1,0,0,0,907,909,5,8,0,0,908,883,1,0,0,0,908,884,1,0,0,0,908,
        885,1,0,0,0,909,89,1,0,0,0,910,912,3,218,109,0,911,913,5,133,0,0,
        912,911,1,0,0,0,912,913,1,0,0,0,913,914,1,0,0,0,914,916,3,222,111,
        0,915,917,5,133,0,0,916,915,1,0,0,0,916,917,1,0,0,0,917,919,1,0,
        0,0,918,920,3,92,46,0,919,918,1,0,0,0,919,920,1,0,0,0,920,922,1,
        0,0,0,921,923,5,133,0,0,922,921,1,0,0,0,922,923,1,0,0,0,923,924,
        1,0,0,0,924,926,3,222,111,0,925,927,5,133,0,0,926,925,1,0,0,0,926,
        927,1,0,0,0,927,928,1,0,0,0,928,929,3,220,110,0,929,975,1,0,0,0,
        930,932,3,218,109,0,931,933,5,133,0,0,932,931,1,0,0,0,932,933,1,
        0,0,0,933,934,1,0,0,0,934,936,3,222,111,0,935,937,5,133,0,0,936,
        935,1,0,0,0,936,937,1,0,0,0,937,939,1,0,0,0,938,940,3,92,46,0,939,
        938,1,0,0,0,939,940,1,0,0,0,940,942,1,0,0,0,941,943,5,133,0,0,942,
        941,1,0,0,0,942,943,1,0,0,0,943,944,1,0,0,0,944,945,3,222,111,0,
        945,975,1,0,0,0,946,948,3,222,111,0,947,949,5,133,0,0,948,947,1,
        0,0,0,948,949,1,0,0,0,949,951,1,0,0,0,950,952,3,92,46,0,951,950,
        1,0,0,0,951,952,1,0,0,0,952,954,1,0,0,0,953,955,5,133,0,0,954,953,
        1,0,0,0,954,955,1,0,0,0,955,956,1,0,0,0,956,958,3,222,111,0,957,
        959,5,133,0,0,958,957,1,0,0,0,958,959,1,0,0,0,959,960,1,0,0,0,960,
        961,3,220,110,0,961,975,1,0,0,0,962,964,3,222,111,0,963,965,5,133,
        0,0,964,963,1,0,0,0,964,965,1,0,0,0,965,967,1,0,0,0,966,968,3,92,
        46,0,967,966,1,0,0,0,967,968,1,0,0,0,968,970,1,0,0,0,969,971,5,133,
        0,0,970,969,1,0,0,0,970,971,1,0,0,0,971,972,1,0,0,0,972,973,3,222,
        111,0,973,975,1,0,0,0,974,910,1,0,0,0,974,930,1,0,0,0,974,946,1,
        0,0,0,974,962,1,0,0,0,975,91,1,0,0,0,976,978,5,12,0,0,977,979,5,
        133,0,0,978,977,1,0,0,0,978,979,1,0,0,0,979,984,1,0,0,0,980,982,
        3,192,96,0,981,983,5,133,0,0,982,981,1,0,0,0,982,983,1,0,0,0,983,
        985,1,0,0,0,984,980,1,0,0,0,984,985,1,0,0,0,985,990,1,0,0,0,986,
        988,3,96,48,0,987,989,5,133,0,0,988,987,1,0,0,0,988,989,1,0,0,0,
        989,991,1,0,0,0,990,986,1,0,0,0,990,991,1,0,0,0,991,993,1,0,0,0,
        992,994,3,102,51,0,993,992,1,0,0,0,993,994,1,0,0,0,994,999,1,0,0,
        0,995,997,3,94,47,0,996,998,5,133,0,0,997,996,1,0,0,0,997,998,1,
        0,0,0,998,1000,1,0,0,0,999,995,1,0,0,0,999,1000,1,0,0,0,1000,1001,
        1,0,0,0,1001,1002,5,13,0,0,1002,93,1,0,0,0,1003,1006,3,206,103,0,
        1004,1006,3,210,105,0,1005,1003,1,0,0,0,1005,1004,1,0,0,0,1006,95,
        1,0,0,0,1007,1009,5,14,0,0,1008,1010,5,133,0,0,1009,1008,1,0,0,0,
        1009,1010,1,0,0,0,1010,1011,1,0,0,0,1011,1025,3,106,53,0,1012,1014,
        5,133,0,0,1013,1012,1,0,0,0,1013,1014,1,0,0,0,1014,1015,1,0,0,0,
        1015,1017,5,3,0,0,1016,1018,5,14,0,0,1017,1016,1,0,0,0,1017,1018,
        1,0,0,0,1018,1020,1,0,0,0,1019,1021,5,133,0,0,1020,1019,1,0,0,0,
        1020,1021,1,0,0,0,1021,1022,1,0,0,0,1022,1024,3,106,53,0,1023,1013,
        1,0,0,0,1024,1027,1,0,0,0,1025,1023,1,0,0,0,1025,1026,1,0,0,0,1026,
        97,1,0,0,0,1027,1025,1,0,0,0,1028,1035,3,100,50,0,1029,1031,5,133,
        0,0,1030,1029,1,0,0,0,1030,1031,1,0,0,0,1031,1032,1,0,0,0,1032,1034,
        3,100,50,0,1033,1030,1,0,0,0,1034,1037,1,0,0,0,1035,1033,1,0,0,0,
        1035,1036,1,0,0,0,1036,99,1,0,0,0,1037,1035,1,0,0,0,1038,1040,5,
        14,0,0,1039,1041,5,133,0,0,1040,1039,1,0,0,0,1040,1041,1,0,0,0,1041,
        1042,1,0,0,0,1042,1043,3,104,52,0,1043,101,1,0,0,0,1044,1046,5,5,
        0,0,1045,1047,5,133,0,0,1046,1045,1,0,0,0,1046,1047,1,0,0,0,1047,
        1052,1,0,0,0,1048,1050,3,200,100,0,1049,1051,5,133,0,0,1050,1049,
        1,0,0,0,1050,1051,1,0,0,0,1051,1053,1,0,0,0,1052,1048,1,0,0,0,1052,
        1053,1,0,0,0,1053,1064,1,0,0,0,1054,1056,5,15,0,0,1055,1057,5,133,
        0,0,1056,1055,1,0,0,0,1056,1057,1,0,0,0,1057,1062,1,0,0,0,1058,1060,
        3,200,100,0,1059,1061,5,133,0,0,1060,1059,1,0,0,0,1060,1061,1,0,
        0,0,1061,1063,1,0,0,0,1062,1058,1,0,0,0,1062,1063,1,0,0,0,1063,1065,
        1,0,0,0,1064,1054,1,0,0,0,1064,1065,1,0,0,0,1065,103,1,0,0,0,1066,
        1067,3,212,106,0,1067,105,1,0,0,0,1068,1069,3,212,106,0,1069,107,
        1,0,0,0,1070,1075,3,146,73,0,1071,1073,5,133,0,0,1072,1071,1,0,0,
        0,1072,1073,1,0,0,0,1073,1074,1,0,0,0,1074,1076,3,144,72,0,1075,
        1072,1,0,0,0,1076,1077,1,0,0,0,1077,1075,1,0,0,0,1077,1078,1,0,0,
        0,1078,109,1,0,0,0,1079,1080,3,112,56,0,1080,111,1,0,0,0,1081,1088,
        3,114,57,0,1082,1083,5,133,0,0,1083,1084,5,80,0,0,1084,1085,5,133,
        0,0,1085,1087,3,114,57,0,1086,1082,1,0,0,0,1087,1090,1,0,0,0,1088,
        1086,1,0,0,0,1088,1089,1,0,0,0,1089,113,1,0,0,0,1090,1088,1,0,0,
        0,1091,1098,3,116,58,0,1092,1093,5,133,0,0,1093,1094,5,81,0,0,1094,
        1095,5,133,0,0,1095,1097,3,116,58,0,1096,1092,1,0,0,0,1097,1100,
        1,0,0,0,1098,1096,1,0,0,0,1098,1099,1,0,0,0,1099,115,1,0,0,0,1100,
        1098,1,0,0,0,1101,1108,3,118,59,0,1102,1103,5,133,0,0,1103,1104,
        5,82,0,0,1104,1105,5,133,0,0,1105,1107,3,118,59,0,1106,1102,1,0,
        0,0,1107,1110,1,0,0,0,1108,1106,1,0,0,0,1108,1109,1,0,0,0,1109,117,
        1,0,0,0,1110,1108,1,0,0,0,1111,1113,5,83,0,0,1112,1114,5,133,0,0,
        1113,1112,1,0,0,0,1113,1114,1,0,0,0,1114,1116,1,0,0,0,1115,1111,
        1,0,0,0,1116,1119,1,0,0,0,1117,1115,1,0,0,0,1117,1118,1,0,0,0,1118,
        1120,1,0,0,0,1119,1117,1,0,0,0,1120,1121,3,120,60,0,1121,119,1,0,
        0,0,1122,1129,3,124,62,0,1123,1125,5,133,0,0,1124,1123,1,0,0,0,1124,
        1125,1,0,0,0,1125,1126,1,0,0,0,1126,1128,3,122,61,0,1127,1124,1,
        0,0,0,1128,1131,1,0,0,0,1129,1127,1,0,0,0,1129,1130,1,0,0,0,1130,
        121,1,0,0,0,1131,1129,1,0,0,0,1132,1134,5,9,0,0,1133,1135,5,133,
        0,0,1134,1133,1,0,0,0,1134,1135,1,0,0,0,1135,1136,1,0,0,0,1136,1163,
        3,124,62,0,1137,1139,5,16,0,0,1138,1140,5,133,0,0,1139,1138,1,0,
        0,0,1139,1140,1,0,0,0,1140,1141,1,0,0,0,1141,1163,3,124,62,0,1142,
        1144,5,17,0,0,1143,1145,5,133,0,0,1144,1143,1,0,0,0,1144,1145,1,
        0,0,0,1145,1146,1,0,0,0,1146,1163,3,124,62,0,1147,1149,5,18,0,0,
        1148,1150,5,133,0,0,1149,1148,1,0,0,0,1149,1150,1,0,0,0,1150,1151,
        1,0,0,0,1151,1163,3,124,62,0,1152,1154,5,19,0,0,1153,1155,5,133,
        0,0,1154,1153,1,0,0,0,1154,1155,1,0,0,0,1155,1156,1,0,0,0,1156,1163,
        3,124,62,0,1157,1159,5,20,0,0,1158,1160,5,133,0,0,1159,1158,1,0,
        0,0,1159,1160,1,0,0,0,1160,1161,1,0,0,0,1161,1163,3,124,62,0,1162,
        1132,1,0,0,0,1162,1137,1,0,0,0,1162,1142,1,0,0,0,1162,1147,1,0,0,
        0,1162,1152,1,0,0,0,1162,1157,1,0,0,0,1163,123,1,0,0,0,1164,1170,
        3,132,66,0,1165,1169,3,126,63,0,1166,1169,3,128,64,0,1167,1169,3,
        130,65,0,1168,1165,1,0,0,0,1168,1166,1,0,0,0,1168,1167,1,0,0,0,1169,
        1172,1,0,0,0,1170,1168,1,0,0,0,1170,1171,1,0,0,0,1171,125,1,0,0,
        0,1172,1170,1,0,0,0,1173,1174,5,133,0,0,1174,1175,5,84,0,0,1175,
        1176,5,133,0,0,1176,1188,5,66,0,0,1177,1178,5,133,0,0,1178,1179,
        5,85,0,0,1179,1180,5,133,0,0,1180,1188,5,66,0,0,1181,1182,5,133,
        0,0,1182,1188,5,86,0,0,1183,1185,5,133,0,0,1184,1183,1,0,0,0,1184,
        1185,1,0,0,0,1185,1186,1,0,0,0,1186,1188,5,21,0,0,1187,1173,1,0,
        0,0,1187,1177,1,0,0,0,1187,1181,1,0,0,0,1187,1184,1,0,0,0,1188,1190,
        1,0,0,0,1189,1191,5,133,0,0,1190,1189,1,0,0,0,1190,1191,1,0,0,0,
        1191,1192,1,0,0,0,1192,1193,3,132,66,0,1193,127,1,0,0,0,1194,1195,
        5,133,0,0,1195,1197,5,87,0,0,1196,1198,5,133,0,0,1197,1196,1,0,0,
        0,1197,1198,1,0,0,0,1198,1199,1,0,0,0,1199,1200,3,132,66,0,1200,
        129,1,0,0,0,1201,1202,5,133,0,0,1202,1203,5,88,0,0,1203,1204,5,133,
        0,0,1204,1212,5,89,0,0,1205,1206,5,133,0,0,1206,1207,5,88,0,0,1207,
        1208,5,133,0,0,1208,1209,5,83,0,0,1209,1210,5,133,0,0,1210,1212,
        5,89,0,0,1211,1201,1,0,0,0,1211,1205,1,0,0,0,1212,131,1,0,0,0,1213,
        1232,3,134,67,0,1214,1216,5,133,0,0,1215,1214,1,0,0,0,1215,1216,
        1,0,0,0,1216,1217,1,0,0,0,1217,1219,5,11,0,0,1218,1220,5,133,0,0,
        1219,1218,1,0,0,0,1219,1220,1,0,0,0,1220,1221,1,0,0,0,1221,1231,
        3,134,67,0,1222,1224,5,133,0,0,1223,1222,1,0,0,0,1223,1224,1,0,0,
        0,1224,1225,1,0,0,0,1225,1227,5,22,0,0,1226,1228,5,133,0,0,1227,
        1226,1,0,0,0,1227,1228,1,0,0,0,1228,1229,1,0,0,0,1229,1231,3,134,
        67,0,1230,1215,1,0,0,0,1230,1223,1,0,0,0,1231,1234,1,0,0,0,1232,
        1230,1,0,0,0,1232,1233,1,0,0,0,1233,133,1,0,0,0,1234,1232,1,0,0,
        0,1235,1262,3,136,68,0,1236,1238,5,133,0,0,1237,1236,1,0,0,0,1237,
        1238,1,0,0,0,1238,1239,1,0,0,0,1239,1241,5,5,0,0,1240,1242,5,133,
        0,0,1241,1240,1,0,0,0,1241,1242,1,0,0,0,1242,1243,1,0,0,0,1243,1261,
        3,136,68,0,1244,1246,5,133,0,0,1245,1244,1,0,0,0,1245,1246,1,0,0,
        0,1246,1247,1,0,0,0,1247,1249,5,23,0,0,1248,1250,5,133,0,0,1249,
        1248,1,0,0,0,1249,1250,1,0,0,0,1250,1251,1,0,0,0,1251,1261,3,136,
        68,0,1252,1254,5,133,0,0,1253,1252,1,0,0,0,1253,1254,1,0,0,0,1254,
        1255,1,0,0,0,1255,1257,5,24,0,0,1256,1258,5,133,0,0,1257,1256,1,
        0,0,0,1257,1258,1,0,0,0,1258,1259,1,0,0,0,1259,1261,3,136,68,0,1260,
        1237,1,0,0,0,1260,1245,1,0,0,0,1260,1253,1,0,0,0,1261,1264,1,0,0,
        0,1262,1260,1,0,0,0,1262,1263,1,0,0,0,1263,135,1,0,0,0,1264,1262,
        1,0,0,0,1265,1276,3,138,69,0,1266,1268,5,133,0,0,1267,1266,1,0,0,
        0,1267,1268,1,0,0,0,1268,1269,1,0,0,0,1269,1271,5,25,0,0,1270,1272,
        5,133,0,0,1271,1270,1,0,0,0,1271,1272,1,0,0,0,1272,1273,1,0,0,0,
        1273,1275,3,138,69,0,1274,1267,1,0,0,0,1275,1278,1,0,0,0,1276,1274,
        1,0,0,0,1276,1277,1,0,0,0,1277,137,1,0,0,0,1278,1276,1,0,0,0,1279,
        1286,3,140,70,0,1280,1282,7,2,0,0,1281,1283,5,133,0,0,1282,1281,
        1,0,0,0,1282,1283,1,0,0,0,1283,1284,1,0,0,0,1284,1286,3,140,70,0,
        1285,1279,1,0,0,0,1285,1280,1,0,0,0,1286,139,1,0,0,0,1287,1298,3,
        146,73,0,1288,1290,5,133,0,0,1289,1288,1,0,0,0,1289,1290,1,0,0,0,
        1290,1291,1,0,0,0,1291,1297,3,142,71,0,1292,1294,5,133,0,0,1293,
        1292,1,0,0,0,1293,1294,1,0,0,0,1294,1295,1,0,0,0,1295,1297,3,144,
        72,0,1296,1289,1,0,0,0,1296,1293,1,0,0,0,1297,1300,1,0,0,0,1298,
        1296,1,0,0,0,1298,1299,1,0,0,0,1299,1305,1,0,0,0,1300,1298,1,0,0,
        0,1301,1303,5,133,0,0,1302,1301,1,0,0,0,1302,1303,1,0,0,0,1303,1304,
        1,0,0,0,1304,1306,3,98,49,0,1305,1302,1,0,0,0,1305,1306,1,0,0,0,
        1306,141,1,0,0,0,1307,1308,5,12,0,0,1308,1309,3,110,55,0,1309,1310,
        5,13,0,0,1310,1321,1,0,0,0,1311,1313,5,12,0,0,1312,1314,3,110,55,
        0,1313,1312,1,0,0,0,1313,1314,1,0,0,0,1314,1315,1,0,0,0,1315,1317,
        5,15,0,0,1316,1318,3,110,55,0,1317,1316,1,0,0,0,1317,1318,1,0,0,
        0,1318,1319,1,0,0,0,1319,1321,5,13,0,0,1320,1307,1,0,0,0,1320,1311,
        1,0,0,0,1321,143,1,0,0,0,1322,1324,5,26,0,0,1323,1325,5,133,0,0,
        1324,1323,1,0,0,0,1324,1325,1,0,0,0,1325,1326,1,0,0,0,1326,1327,
        3,208,104,0,1327,145,1,0,0,0,1328,1356,3,194,97,0,1329,1356,3,210,
        105,0,1330,1356,3,154,77,0,1331,1356,3,178,89,0,1332,1334,5,91,0,
        0,1333,1335,5,133,0,0,1334,1333,1,0,0,0,1334,1335,1,0,0,0,1335,1336,
        1,0,0,0,1336,1338,5,2,0,0,1337,1339,5,133,0,0,1338,1337,1,0,0,0,
        1338,1339,1,0,0,0,1339,1340,1,0,0,0,1340,1342,5,5,0,0,1341,1343,
        5,133,0,0,1342,1341,1,0,0,0,1342,1343,1,0,0,0,1343,1344,1,0,0,0,
        1344,1356,5,4,0,0,1345,1356,3,158,79,0,1346,1356,3,160,80,0,1347,
        1356,3,162,81,0,1348,1356,3,148,74,0,1349,1356,3,166,83,0,1350,1356,
        3,168,84,0,1351,1356,3,172,86,0,1352,1356,3,176,88,0,1353,1356,3,
        150,75,0,1354,1356,3,192,96,0,1355,1328,1,0,0,0,1355,1329,1,0,0,
        0,1355,1330,1,0,0,0,1355,1331,1,0,0,0,1355,1332,1,0,0,0,1355,1345,
        1,0,0,0,1355,1346,1,0,0,0,1355,1347,1,0,0,0,1355,1348,1,0,0,0,1355,
        1349,1,0,0,0,1355,1350,1,0,0,0,1355,1351,1,0,0,0,1355,1352,1,0,0,
        0,1355,1353,1,0,0,0,1355,1354,1,0,0,0,1356,147,1,0,0,0,1357,1359,
        5,90,0,0,1358,1360,5,133,0,0,1359,1358,1,0,0,0,1359,1360,1,0,0,0,
        1360,1361,1,0,0,0,1361,1363,5,2,0,0,1362,1364,5,133,0,0,1363,1362,
        1,0,0,0,1363,1364,1,0,0,0,1364,1365,1,0,0,0,1365,1367,3,192,96,0,
        1366,1368,5,133,0,0,1367,1366,1,0,0,0,1367,1368,1,0,0,0,1368,1369,
        1,0,0,0,1369,1371,5,9,0,0,1370,1372,5,133,0,0,1371,1370,1,0,0,0,
        1371,1372,1,0,0,0,1372,1373,1,0,0,0,1373,1375,3,110,55,0,1374,1376,
        5,133,0,0,1375,1374,1,0,0,0,1375,1376,1,0,0,0,1376,1377,1,0,0,0,
        1377,1379,5,6,0,0,1378,1380,5,133,0,0,1379,1378,1,0,0,0,1379,1380,
        1,0,0,0,1380,1381,1,0,0,0,1381,1383,3,170,85,0,1382,1384,5,133,0,
        0,1383,1382,1,0,0,0,1383,1384,1,0,0,0,1384,1385,1,0,0,0,1385,1387,
        5,3,0,0,1386,1388,5,133,0,0,1387,1386,1,0,0,0,1387,1388,1,0,0,0,
        1388,1389,1,0,0,0,1389,1391,3,110,55,0,1390,1392,5,133,0,0,1391,
        1390,1,0,0,0,1391,1392,1,0,0,0,1392,1393,1,0,0,0,1393,1394,5,4,0,
        0,1394,149,1,0,0,0,1395,1397,3,192,96,0,1396,1398,5,133,0,0,1397,
        1396,1,0,0,0,1397,1398,1,0,0,0,1398,1399,1,0,0,0,1399,1401,5,7,0,
        0,1400,1402,5,133,0,0,1401,1400,1,0,0,0,1401,1402,1,0,0,0,1402,1420,
        1,0,0,0,1403,1405,3,152,76,0,1404,1406,5,133,0,0,1405,1404,1,0,0,
        0,1405,1406,1,0,0,0,1406,1417,1,0,0,0,1407,1409,5,6,0,0,1408,1410,
        5,133,0,0,1409,1408,1,0,0,0,1409,1410,1,0,0,0,1410,1411,1,0,0,0,
        1411,1413,3,152,76,0,1412,1414,5,133,0,0,1413,1412,1,0,0,0,1413,
        1414,1,0,0,0,1414,1416,1,0,0,0,1415,1407,1,0,0,0,1416,1419,1,0,0,
        0,1417,1415,1,0,0,0,1417,1418,1,0,0,0,1418,1421,1,0,0,0,1419,1417,
        1,0,0,0,1420,1403,1,0,0,0,1420,1421,1,0,0,0,1421,1422,1,0,0,0,1422,
        1423,5,8,0,0,1423,151,1,0,0,0,1424,1426,3,208,104,0,1425,1427,5,
        133,0,0,1426,1425,1,0,0,0,1426,1427,1,0,0,0,1427,1428,1,0,0,0,1428,
        1430,5,14,0,0,1429,1431,5,133,0,0,1430,1429,1,0,0,0,1430,1431,1,
        0,0,0,1431,1432,1,0,0,0,1432,1433,3,110,55,0,1433,1446,1,0,0,0,1434,
        1436,5,26,0,0,1435,1437,5,133,0,0,1436,1435,1,0,0,0,1436,1437,1,
        0,0,0,1437,1438,1,0,0,0,1438,1446,3,208,104,0,1439,1441,5,26,0,0,
        1440,1442,5,133,0,0,1441,1440,1,0,0,0,1441,1442,1,0,0,0,1442,1443,
        1,0,0,0,1443,1446,5,5,0,0,1444,1446,3,192,96,0,1445,1424,1,0,0,0,
        1445,1434,1,0,0,0,1445,1439,1,0,0,0,1445,1444,1,0,0,0,1446,153,1,
        0,0,0,1447,1452,5,92,0,0,1448,1450,5,133,0,0,1449,1448,1,0,0,0,1449,
        1450,1,0,0,0,1450,1451,1,0,0,0,1451,1453,3,156,78,0,1452,1449,1,
        0,0,0,1453,1454,1,0,0,0,1454,1452,1,0,0,0,1454,1455,1,0,0,0,1455,
        1470,1,0,0,0,1456,1458,5,92,0,0,1457,1459,5,133,0,0,1458,1457,1,
        0,0,0,1458,1459,1,0,0,0,1459,1460,1,0,0,0,1460,1465,3,110,55,0,1461,
        1463,5,133,0,0,1462,1461,1,0,0,0,1462,1463,1,0,0,0,1463,1464,1,0,
        0,0,1464,1466,3,156,78,0,1465,1462,1,0,0,0,1466,1467,1,0,0,0,1467,
        1465,1,0,0,0,1467,1468,1,0,0,0,1468,1470,1,0,0,0,1469,1447,1,0,0,
        0,1469,1456,1,0,0,0,1470,1479,1,0,0,0,1471,1473,5,133,0,0,1472,1471,
        1,0,0,0,1472,1473,1,0,0,0,1473,1474,1,0,0,0,1474,1476,5,93,0,0,1475,
        1477,5,133,0,0,1476,1475,1,0,0,0,1476,1477,1,0,0,0,1477,1478,1,0,
        0,0,1478,1480,3,110,55,0,1479,1472,1,0,0,0,1479,1480,1,0,0,0,1480,
        1482,1,0,0,0,1481,1483,5,133,0,0,1482,1481,1,0,0,0,1482,1483,1,0,
        0,0,1483,1484,1,0,0,0,1484,1485,5,94,0,0,1485,155,1,0,0,0,1486,1488,
        5,95,0,0,1487,1489,5,133,0,0,1488,1487,1,0,0,0,1488,1489,1,0,0,0,
        1489,1490,1,0,0,0,1490,1492,3,110,55,0,1491,1493,5,133,0,0,1492,
        1491,1,0,0,0,1492,1493,1,0,0,0,1493,1494,1,0,0,0,1494,1496,5,96,
        0,0,1495,1497,5,133,0,0,1496,1495,1,0,0,0,1496,1497,1,0,0,0,1497,
        1498,1,0,0,0,1498,1499,3,110,55,0,1499,157,1,0,0,0,1500,1502,5,12,
        0,0,1501,1503,5,133,0,0,1502,1501,1,0,0,0,1502,1503,1,0,0,0,1503,
        1504,1,0,0,0,1504,1513,3,164,82,0,1505,1507,5,133,0,0,1506,1505,
        1,0,0,0,1506,1507,1,0,0,0,1507,1508,1,0,0,0,1508,1510,5,3,0,0,1509,
        1511,5,133,0,0,1510,1509,1,0,0,0,1510,1511,1,0,0,0,1511,1512,1,0,
        0,0,1512,1514,3,110,55,0,1513,1506,1,0,0,0,1513,1514,1,0,0,0,1514,
        1516,1,0,0,0,1515,1517,5,133,0,0,1516,1515,1,0,0,0,1516,1517,1,0,
        0,0,1517,1518,1,0,0,0,1518,1519,5,13,0,0,1519,159,1,0,0,0,1520,1522,
        5,12,0,0,1521,1523,5,133,0,0,1522,1521,1,0,0,0,1522,1523,1,0,0,0,
        1523,1532,1,0,0,0,1524,1526,3,192,96,0,1525,1527,5,133,0,0,1526,
        1525,1,0,0,0,1526,1527,1,0,0,0,1527,1528,1,0,0,0,1528,1530,5,9,0,
        0,1529,1531,5,133,0,0,1530,1529,1,0,0,0,1530,1531,1,0,0,0,1531,1533,
        1,0,0,0,1532,1524,1,0,0,0,1532,1533,1,0,0,0,1533,1534,1,0,0,0,1534,
        1536,3,82,41,0,1535,1537,5,133,0,0,1536,1535,1,0,0,0,1536,1537,1,
        0,0,0,1537,1542,1,0,0,0,1538,1540,3,70,35,0,1539,1541,5,133,0,0,
        1540,1539,1,0,0,0,1540,1541,1,0,0,0,1541,1543,1,0,0,0,1542,1538,
        1,0,0,0,1542,1543,1,0,0,0,1543,1544,1,0,0,0,1544,1546,5,3,0,0,1545,
        1547,5,133,0,0,1546,1545,1,0,0,0,1546,1547,1,0,0,0,1547,1548,1,0,
        0,0,1548,1550,3,110,55,0,1549,1551,5,133,0,0,1550,1549,1,0,0,0,1550,
        1551,1,0,0,0,1551,1552,1,0,0,0,1552,1553,5,13,0,0,1553,161,1,0,0,
        0,1554,1556,5,48,0,0,1555,1557,5,133,0,0,1556,1555,1,0,0,0,1556,
        1557,1,0,0,0,1557,1558,1,0,0,0,1558,1560,5,2,0,0,1559,1561,5,133,
        0,0,1560,1559,1,0,0,0,1560,1561,1,0,0,0,1561,1562,1,0,0,0,1562,1564,
        3,164,82,0,1563,1565,5,133,0,0,1564,1563,1,0,0,0,1564,1565,1,0,0,
        0,1565,1566,1,0,0,0,1566,1567,5,4,0,0,1567,1611,1,0,0,0,1568,1570,
        5,97,0,0,1569,1571,5,133,0,0,1570,1569,1,0,0,0,1570,1571,1,0,0,0,
        1571,1572,1,0,0,0,1572,1574,5,2,0,0,1573,1575,5,133,0,0,1574,1573,
        1,0,0,0,1574,1575,1,0,0,0,1575,1576,1,0,0,0,1576,1578,3,164,82,0,
        1577,1579,5,133,0,0,1578,1577,1,0,0,0,1578,1579,1,0,0,0,1579,1580,
        1,0,0,0,1580,1581,5,4,0,0,1581,1611,1,0,0,0,1582,1584,5,98,0,0,1583,
        1585,5,133,0,0,1584,1583,1,0,0,0,1584,1585,1,0,0,0,1585,1586,1,0,
        0,0,1586,1588,5,2,0,0,1587,1589,5,133,0,0,1588,1587,1,0,0,0,1588,
        1589,1,0,0,0,1589,1590,1,0,0,0,1590,1592,3,164,82,0,1591,1593,5,
        133,0,0,1592,1591,1,0,0,0,1592,1593,1,0,0,0,1593,1594,1,0,0,0,1594,
        1595,5,4,0,0,1595,1611,1,0,0,0,1596,1598,5,99,0,0,1597,1599,5,133,
        0,0,1598,1597,1,0,0,0,1598,1599,1,0,0,0,1599,1600,1,0,0,0,1600,1602,
        5,2,0,0,1601,1603,5,133,0,0,1602,1601,1,0,0,0,1602,1603,1,0,0,0,
        1603,1604,1,0,0,0,1604,1606,3,164,82,0,1605,1607,5,133,0,0,1606,
        1605,1,0,0,0,1606,1607,1,0,0,0,1607,1608,1,0,0,0,1608,1609,5,4,0,
        0,1609,1611,1,0,0,0,1610,1554,1,0,0,0,1610,1568,1,0,0,0,1610,1582,
        1,0,0,0,1610,1596,1,0,0,0,1611,163,1,0,0,0,1612,1617,3,170,85,0,
        1613,1615,5,133,0,0,1614,1613,1,0,0,0,1614,1615,1,0,0,0,1615,1616,
        1,0,0,0,1616,1618,3,70,35,0,1617,1614,1,0,0,0,1617,1618,1,0,0,0,
        1618,165,1,0,0,0,1619,1620,3,82,41,0,1620,167,1,0,0,0,1621,1623,
        5,2,0,0,1622,1624,5,133,0,0,1623,1622,1,0,0,0,1623,1624,1,0,0,0,
        1624,1625,1,0,0,0,1625,1627,3,110,55,0,1626,1628,5,133,0,0,1627,
        1626,1,0,0,0,1627,1628,1,0,0,0,1628,1629,1,0,0,0,1629,1630,5,4,0,
        0,1630,169,1,0,0,0,1631,1632,3,192,96,0,1632,1633,5,133,0,0,1633,
        1634,5,87,0,0,1634,1635,5,133,0,0,1635,1636,3,110,55,0,1636,171,
        1,0,0,0,1637,1639,3,174,87,0,1638,1640,5,133,0,0,1639,1638,1,0,0,
        0,1639,1640,1,0,0,0,1640,1641,1,0,0,0,1641,1643,5,2,0,0,1642,1644,
        5,133,0,0,1643,1642,1,0,0,0,1643,1644,1,0,0,0,1644,1649,1,0,0,0,
        1645,1647,5,68,0,0,1646,1648,5,133,0,0,1647,1646,1,0,0,0,1647,1648,
        1,0,0,0,1648,1650,1,0,0,0,1649,1645,1,0,0,0,1649,1650,1,0,0,0,1650,
        1668,1,0,0,0,1651,1653,3,110,55,0,1652,1654,5,133,0,0,1653,1652,
        1,0,0,0,1653,1654,1,0,0,0,1654,1665,1,0,0,0,1655,1657,5,6,0,0,1656,
        1658,5,133,0,0,1657,1656,1,0,0,0,1657,1658,1,0,0,0,1658,1659,1,0,
        0,0,1659,1661,3,110,55,0,1660,1662,5,133,0,0,1661,1660,1,0,0,0,1661,
        1662,1,0,0,0,1662,1664,1,0,0,0,1663,1655,1,0,0,0,1664,1667,1,0,0,
        0,1665,1663,1,0,0,0,1665,1666,1,0,0,0,1666,1669,1,0,0,0,1667,1665,
        1,0,0,0,1668,1651,1,0,0,0,1668,1669,1,0,0,0,1669,1670,1,0,0,0,1670,
        1671,5,4,0,0,1671,173,1,0,0,0,1672,1673,3,190,95,0,1673,1674,3,216,
        108,0,1674,175,1,0,0,0,1675,1677,5,100,0,0,1676,1678,5,133,0,0,1677,
        1676,1,0,0,0,1677,1678,1,0,0,0,1678,1679,1,0,0,0,1679,1681,5,7,0,
        0,1680,1682,5,133,0,0,1681,1680,1,0,0,0,1681,1682,1,0,0,0,1682,1692,
        1,0,0,0,1683,1693,3,6,3,0,1684,1693,3,180,90,0,1685,1690,3,72,36,
        0,1686,1688,5,133,0,0,1687,1686,1,0,0,0,1687,1688,1,0,0,0,1688,1689,
        1,0,0,0,1689,1691,3,70,35,0,1690,1687,1,0,0,0,1690,1691,1,0,0,0,
        1691,1693,1,0,0,0,1692,1683,1,0,0,0,1692,1684,1,0,0,0,1692,1685,
        1,0,0,0,1693,1695,1,0,0,0,1694,1696,5,133,0,0,1695,1694,1,0,0,0,
        1695,1696,1,0,0,0,1696,1697,1,0,0,0,1697,1698,5,8,0,0,1698,177,1,
        0,0,0,1699,1701,5,91,0,0,1700,1702,5,133,0,0,1701,1700,1,0,0,0,1701,
        1702,1,0,0,0,1702,1703,1,0,0,0,1703,1705,5,7,0,0,1704,1706,5,133,
        0,0,1705,1704,1,0,0,0,1705,1706,1,0,0,0,1706,1716,1,0,0,0,1707,1717,
        3,6,3,0,1708,1717,3,180,90,0,1709,1714,3,72,36,0,1710,1712,5,133,
        0,0,1711,1710,1,0,0,0,1711,1712,1,0,0,0,1712,1713,1,0,0,0,1713,1715,
        3,70,35,0,1714,1711,1,0,0,0,1714,1715,1,0,0,0,1715,1717,1,0,0,0,
        1716,1707,1,0,0,0,1716,1708,1,0,0,0,1716,1709,1,0,0,0,1717,1719,
        1,0,0,0,1718,1720,5,133,0,0,1719,1718,1,0,0,0,1719,1720,1,0,0,0,
        1720,1721,1,0,0,0,1721,1722,5,8,0,0,1722,179,1,0,0,0,1723,1730,3,
        20,10,0,1724,1726,5,133,0,0,1725,1724,1,0,0,0,1725,1726,1,0,0,0,
        1726,1727,1,0,0,0,1727,1729,3,20,10,0,1728,1725,1,0,0,0,1729,1732,
        1,0,0,0,1730,1728,1,0,0,0,1730,1731,1,0,0,0,1731,181,1,0,0,0,1732,
        1730,1,0,0,0,1733,1735,3,188,94,0,1734,1736,5,133,0,0,1735,1734,
        1,0,0,0,1735,1736,1,0,0,0,1736,1737,1,0,0,0,1737,1739,5,2,0,0,1738,
        1740,5,133,0,0,1739,1738,1,0,0,0,1739,1740,1,0,0,0,1740,1758,1,0,
        0,0,1741,1743,3,110,55,0,1742,1744,5,133,0,0,1743,1742,1,0,0,0,1743,
        1744,1,0,0,0,1744,1755,1,0,0,0,1745,1747,5,6,0,0,1746,1748,5,133,
        0,0,1747,1746,1,0,0,0,1747,1748,1,0,0,0,1748,1749,1,0,0,0,1749,1751,
        3,110,55,0,1750,1752,5,133,0,0,1751,1750,1,0,0,0,1751,1752,1,0,0,
        0,1752,1754,1,0,0,0,1753,1745,1,0,0,0,1754,1757,1,0,0,0,1755,1753,
        1,0,0,0,1755,1756,1,0,0,0,1756,1759,1,0,0,0,1757,1755,1,0,0,0,1758,
        1741,1,0,0,0,1758,1759,1,0,0,0,1759,1760,1,0,0,0,1760,1761,5,4,0,
        0,1761,183,1,0,0,0,1762,1763,3,188,94,0,1763,185,1,0,0,0,1764,1765,
        3,216,108,0,1765,187,1,0,0,0,1766,1767,3,190,95,0,1767,1768,3,216,
        108,0,1768,189,1,0,0,0,1769,1770,3,216,108,0,1770,1771,5,26,0,0,
        1771,1773,1,0,0,0,1772,1769,1,0,0,0,1773,1776,1,0,0,0,1774,1772,
        1,0,0,0,1774,1775,1,0,0,0,1775,191,1,0,0,0,1776,1774,1,0,0,0,1777,
        1778,3,216,108,0,1778,193,1,0,0,0,1779,1786,3,196,98,0,1780,1786,
        5,89,0,0,1781,1786,3,198,99,0,1782,1786,5,115,0,0,1783,1786,3,204,
        102,0,1784,1786,3,206,103,0,1785,1779,1,0,0,0,1785,1780,1,0,0,0,
        1785,1781,1,0,0,0,1785,1782,1,0,0,0,1785,1783,1,0,0,0,1785,1784,
        1,0,0,0,1786,195,1,0,0,0,1787,1788,7,3,0,0,1788,197,1,0,0,0,1789,
        1792,3,202,101,0,1790,1792,3,200,100,0,1791,1789,1,0,0,0,1791,1790,
        1,0,0,0,1792,199,1,0,0,0,1793,1794,7,4,0,0,1794,201,1,0,0,0,1795,
        1796,7,5,0,0,1796,203,1,0,0,0,1797,1799,5,12,0,0,1798,1800,5,133,
        0,0,1799,1798,1,0,0,0,1799,1800,1,0,0,0,1800,1818,1,0,0,0,1801,1803,
        3,110,55,0,1802,1804,5,133,0,0,1803,1802,1,0,0,0,1803,1804,1,0,0,
        0,1804,1815,1,0,0,0,1805,1807,5,6,0,0,1806,1808,5,133,0,0,1807,1806,
        1,0,0,0,1807,1808,1,0,0,0,1808,1809,1,0,0,0,1809,1811,3,110,55,0,
        1810,1812,5,133,0,0,1811,1810,1,0,0,0,1811,1812,1,0,0,0,1812,1814,
        1,0,0,0,1813,1805,1,0,0,0,1814,1817,1,0,0,0,1815,1813,1,0,0,0,1815,
        1816,1,0,0,0,1816,1819,1,0,0,0,1817,1815,1,0,0,0,1818,1801,1,0,0,
        0,1818,1819,1,0,0,0,1819,1820,1,0,0,0,1820,1821,5,13,0,0,1821,205,
        1,0,0,0,1822,1824,5,7,0,0,1823,1825,5,133,0,0,1824,1823,1,0,0,0,
        1824,1825,1,0,0,0,1825,1859,1,0,0,0,1826,1828,3,208,104,0,1827,1829,
        5,133,0,0,1828,1827,1,0,0,0,1828,1829,1,0,0,0,1829,1830,1,0,0,0,
        1830,1832,5,14,0,0,1831,1833,5,133,0,0,1832,1831,1,0,0,0,1832,1833,
        1,0,0,0,1833,1834,1,0,0,0,1834,1836,3,110,55,0,1835,1837,5,133,0,
        0,1836,1835,1,0,0,0,1836,1837,1,0,0,0,1837,1856,1,0,0,0,1838,1840,
        5,6,0,0,1839,1841,5,133,0,0,1840,1839,1,0,0,0,1840,1841,1,0,0,0,
        1841,1842,1,0,0,0,1842,1844,3,208,104,0,1843,1845,5,133,0,0,1844,
        1843,1,0,0,0,1844,1845,1,0,0,0,1845,1846,1,0,0,0,1846,1848,5,14,
        0,0,1847,1849,5,133,0,0,1848,1847,1,0,0,0,1848,1849,1,0,0,0,1849,
        1850,1,0,0,0,1850,1852,3,110,55,0,1851,1853,5,133,0,0,1852,1851,
        1,0,0,0,1852,1853,1,0,0,0,1853,1855,1,0,0,0,1854,1838,1,0,0,0,1855,
        1858,1,0,0,0,1856,1854,1,0,0,0,1856,1857,1,0,0,0,1857,1860,1,0,0,
        0,1858,1856,1,0,0,0,1859,1826,1,0,0,0,1859,1860,1,0,0,0,1860,1861,
        1,0,0,0,1861,1862,5,8,0,0,1862,207,1,0,0,0,1863,1864,3,212,106,0,
        1864,209,1,0,0,0,1865,1868,5,27,0,0,1866,1869,3,216,108,0,1867,1869,
        5,104,0,0,1868,1866,1,0,0,0,1868,1867,1,0,0,0,1869,211,1,0,0,0,1870,
        1873,3,216,108,0,1871,1873,3,214,107,0,1872,1870,1,0,0,0,1872,1871,
        1,0,0,0,1873,213,1,0,0,0,1874,1875,7,6,0,0,1875,215,1,0,0,0,1876,
        1877,7,7,0,0,1877,217,1,0,0,0,1878,1879,7,8,0,0,1879,219,1,0,0,0,
        1880,1881,7,9,0,0,1881,221,1,0,0,0,1882,1883,7,10,0,0,1883,223,1,
        0,0,0,359,225,229,232,235,243,247,252,259,264,267,271,275,279,285,
        289,294,299,303,306,308,312,316,321,325,330,334,345,349,353,361,
        365,370,373,381,385,389,393,398,402,407,410,413,417,419,423,427,
        441,443,447,451,455,458,462,472,479,492,496,502,506,510,515,520,
        524,530,534,540,544,550,554,558,562,566,570,575,582,586,591,598,
        604,609,615,618,624,626,630,634,639,643,646,653,660,663,669,672,
        678,682,686,690,694,699,704,708,713,716,725,734,739,752,755,763,
        767,772,777,781,786,790,794,798,802,808,812,816,820,824,829,836,
        840,845,849,853,855,859,861,865,867,873,876,879,887,890,893,897,
        900,903,905,908,912,916,919,922,926,932,936,939,942,948,951,954,
        958,964,967,970,974,978,982,984,988,990,993,997,999,1005,1009,1013,
        1017,1020,1025,1030,1035,1040,1046,1050,1052,1056,1060,1062,1064,
        1072,1077,1088,1098,1108,1113,1117,1124,1129,1134,1139,1144,1149,
        1154,1159,1162,1168,1170,1184,1187,1190,1197,1211,1215,1219,1223,
        1227,1230,1232,1237,1241,1245,1249,1253,1257,1260,1262,1267,1271,
        1276,1282,1285,1289,1293,1296,1298,1302,1305,1313,1317,1320,1324,
        1334,1338,1342,1355,1359,1363,1367,1371,1375,1379,1383,1387,1391,
        1397,1401,1405,1409,1413,1417,1420,1426,1430,1436,1441,1445,1449,
        1454,1458,1462,1467,1469,1472,1476,1479,1482,1488,1492,1496,1502,
        1506,1510,1513,1516,1522,1526,1530,1532,1536,1540,1542,1546,1550,
        1556,1560,1564,1570,1574,1578,1584,1588,1592,1598,1602,1606,1610,
        1614,1617,1623,1627,1639,1643,1647,1649,1653,1657,1661,1665,1668,
        1677,1681,1687,1690,1692,1695,1701,1705,1711,1714,1716,1719,1725,
        1730,1735,1739,1743,1747,1751,1755,1758,1774,1785,1791,1799,1803,
        1807,1811,1815,1818,1824,1828,1832,1836,1840,1844,1848,1852,1856,
        1859,1868,1872
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
    public oC_NodePattern(): OC_NodePatternContext | null {
        return this.getRuleContext(0, OC_NodePatternContext);
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
