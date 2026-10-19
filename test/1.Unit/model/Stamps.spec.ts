import { GraphView, ModelRegistry, NodeFragment, NodeId, NodeStamp, Root, Stamps } from '@liberation-data/drivine';

describe('Stamps', () => {
    const [d1, d2, d3] = ['1111111111111111', '2222222222222222', '3333333333333333'];
    const [l1, l2, l3] = ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', 'cccccccccccccccc'];

    it('should make two random tokens of 64 bits', () => {
        expect(Stamps.fresh()).toMatch(/^[0-9a-f]{16}:[0-9a-f]{16}$/);
        expect(Stamps.fresh()).not.toEqual(Stamps.fresh());
    });

    it('should hand back what the node now carries when the object carried what it found', () => {
        expect(Stamps.handedBack(`${d1}:${l1}`, `${d1}:${l1}`, `${d2}:${l2}`)).toEqual(`${d2}:${l2}`);
    });

    it('should hand back only the tokens that were as the object said', () => {
        // Another writer replaced the links token: the object keeps its own, so a replace is refused until it loads.
        expect(Stamps.handedBack(`${d1}:${l1}`, `${d1}:${l3}`, `${d2}:${l3}`)).toEqual(`${d2}:${l1}`);
        expect(Stamps.handedBack(`${d1}:${l1}`, `${d3}:${l1}`, `${d2}:${l2}`)).toEqual(`${d1}:${l2}`);
    });

    it('should hand an object without a stamp the whole stamp of a node it made, and the data token of one it found', () => {
        expect(Stamps.handedBack(undefined, '', `${d2}:${l2}`)).toEqual(`${d2}:${l2}`);
        expect(Stamps.handedBack(undefined, `${d1}:${l1}`, `${d2}:${l1}`)).toEqual(`${d2}:`);
        expect(Stamps.handedBack(undefined, '-', `${d2}:${l2}`)).toEqual(`${d2}:`);
    });
});

describe('@NodeStamp', () => {
    it('should be read into the fragment model', () => {
        @NodeFragment({ labels: ['P'] })
        class P {
            @NodeId() id: string;
            @NodeStamp() stamp?: string;
        }
        expect(new ModelRegistry().fragment(P).stampField).toEqual('stamp');
    });

    it('should be one to a fragment, and not on a view', () => {
        @NodeFragment({ labels: ['P'] })
        class Two {
            @NodeId() id: string;
            @NodeStamp() a?: string;
            @NodeStamp() b?: string;
        }
        expect(() => new ModelRegistry().fragment(Two)).toThrow(/2 @NodeStamp properties/);

        @NodeFragment({ labels: ['P'] })
        class P {
            @NodeId() id: string;
        }
        @GraphView()
        class V {
            @Root() p: P;
            @NodeStamp() stamp?: string;
        }
        expect(() => new ModelRegistry().view(V)).toThrow(/@NodeStamp can't be used on a @GraphView/);
    });
});
