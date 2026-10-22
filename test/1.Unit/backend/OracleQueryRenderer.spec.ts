import { ModelRegistry, NodeFragment, NodeId, OracleBackend, OracleGraph, TargetModel } from '@liberation-data/drivine';

@NodeFragment({ labels: ['Claim'] })
class Claim {
    @NodeId() id: string;
    name: string;
}

// drivine4j's OraclePredicatesTest for matches, ported.
const claim: TargetModel = { kind: 'NODE_FRAGMENT', model: new ModelRegistry().fragment(Claim) };
const matching = (pattern: string): { where: string; bindings: Record<string, any> } =>
    new OracleBackend(new OracleGraph()).renderWhere((q: any) => q.name.matches(pattern), claim);
const bound = (pattern: string): string => Object.values(matching(pattern).bindings)[0];

describe('OracleQueryRenderer', () => {
    it('should hold an expression to the whole value', () => {
        const rendered = matching('a.*');
        expect(rendered.where).toEqual(`REGEXP_LIKE(JSON_VALUE(n.props, '$."name"'), $_q0)`);
        expect(rendered.bindings).toEqual({ _q0: '^(a.*)$' });
    });

    it('should renumber a backreference for the group that anchors the expression', () => {
        expect(bound('(A).*\\1')).toEqual('^((A).*\\2)$');
        expect(bound('(a)(b)\\2\\1')).toEqual('^((a)(b)\\3\\2)$');
        // An escaped backslash, and a backslash in a bracket expression, are no backreferences.
        expect(bound('a\\\\1')).toEqual('^(a\\\\1)$');
        expect(bound('[\\1]x')).toEqual('^([\\1]x)$');
        expect(bound('[]\\1](a)\\1')).toEqual('^([]\\1](a)\\2)$');
    });

    it('should refuse a reference to a ninth group, which would need a tenth', () => {
        expect(() => matching('(a)(b)(c)(d)(e)(f)(g)(h)(i)\\9')).toThrow(/ninth/);
    });

    it('should ignore case only for a leading case flag, which is taken off the expression', () => {
        const rendered = matching('(?i)a.*');
        expect(rendered.where).toEqual(`REGEXP_LIKE(JSON_VALUE(n.props, '$."name"'), $_q0, 'i')`);
        expect(rendered.bindings).toEqual({ _q0: '^(a.*)$' });
        expect(matching('a(?i)b').where).not.toContain("'i'");
        expect(bound('(?i)(a)\\1')).toEqual('^((a)\\2)$');
    });
});
