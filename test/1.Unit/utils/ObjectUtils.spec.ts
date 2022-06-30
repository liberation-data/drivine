import { Transform } from 'class-transformer';
import { ObjectUtils } from '@/utils';
const uuid = require('uuid').v4;

class Urbanite {

    readonly id: string;

    readonly firstName: string;

    readonly lastName: string;

    @Transform((params) => params.value.valueOf(), { toPlainOnly: true })
    @Transform((params) => new Date(params.value), { toClassOnly: true })
    readonly dateOfBirth: Date;

    nonPrimitiveProperty: Date;

    constructor(id: string, firstName: string, lastName: string, dateOfBirth: Date) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.dateOfBirth = dateOfBirth;
    }

}

describe('ObjectUtils::primitiveProps', () => {

    it('should strip the non-primitive properties from an object', () => {
        const mg = new Urbanite(uuid(),'Brutus', 'Paramdal', new Date('1984-06-22'));
        mg.nonPrimitiveProperty = new Date();
        const props = ObjectUtils.primitiveProps(mg);
        expect(props.id).not.toBeNull();
        expect(props.firstName).toEqual('Brutus');
        expect(props.lastName).toEqual('Paramdal');
        expect(props.dateOfBirth).toEqual(456710400000);
        expect(props.nonPrimitiveProperty).toBeUndefined();
    });

});
