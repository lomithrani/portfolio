import { describe, expect, it } from 'vitest';
import { ADDRESS_SEARCH, type AddressSuggestion } from 'portfolio-common';
import { addressSearchParams, officeFromSuggestion, officeKey } from '../addressSearch';

describe('addressSearchParams', () => {
	it('sends what was typed, tidied, once there is enough to look up', () => {
		expect(addressSearchParams({ text: '  12  rue de   la rep ' })).toEqual({
			q: '12 rue de la rep'
		});
		for (const text of ['', '  ', '12', ' 1  ']) {
			expect(addressSearchParams({ text })).toBeNull();
		}
		expect(addressSearchParams({ text: 'a'.repeat(500) })?.q).toHaveLength(
			ADDRESS_SEARCH.maxLength
		);
	});

	it('narrows the search to a whole postal code and to the town typed', () => {
		expect(
			addressSearchParams({ text: '12 rue de la rep', postalCode: ' 69002 ', city: ' Lyon ' })
		).toEqual({ q: '12 rue de la rep', postalCode: '69002', city: 'Lyon' });
		// A postal code still being typed, or not a French one, narrows nothing
		for (const postalCode of ['690', '6900A', 'SW1A 1AA', '']) {
			expect(addressSearchParams({ text: '12 rue de la rep', postalCode, city: '' })).toEqual({
				q: '12 rue de la rep'
			});
		}
	});
});

describe('officeFromSuggestion', () => {
	const current = { address: '12 rue de la rep', postalCode: '', city: 'Lyon' };
	const street: AddressSuggestion = {
		label: '12 Rue de la République 69002 Lyon',
		kind: 'housenumber',
		street: '12 Rue de la République',
		postalCode: '69002',
		city: 'Lyon'
	};

	it('puts the street in the address, and its postal code and town in theirs', () => {
		expect(officeFromSuggestion(street, current)).toEqual({
			address: '12 Rue de la République',
			postalCode: '69002',
			city: 'Lyon'
		});
		// What the suggestion does not say stays as typed
		expect(
			officeFromSuggestion(
				{ label: 'Place Bellecour', kind: 'street', street: 'Place Bellecour' },
				{ ...current, postalCode: '69002' }
			)
		).toEqual({ address: 'Place Bellecour', postalCode: '69002', city: 'Lyon' });
	});

	it('keeps the street typed when a town is picked', () => {
		expect(
			officeFromSuggestion(
				{ label: 'Villeurbanne', kind: 'municipality', postalCode: '69100', city: 'Villeurbanne' },
				current
			)
		).toEqual({ address: '12 rue de la rep', postalCode: '69100', city: 'Villeurbanne' });
	});
});

describe('officeKey', () => {
	it('is the same for an office typed with other spaces or capitals, and for no other', () => {
		const office = { address: '12 Rue de la République', postalCode: '69002', city: 'Lyon' };
		expect(
			officeKey({ address: ' 12 rue  de la république ', postalCode: '69002', city: 'LYON' })
		).toBe(officeKey(office));
		expect(officeKey({ ...office, address: '14 Rue de la République' })).not.toBe(
			officeKey(office)
		);
		expect(officeKey({ ...office, address: '', city: '12 Rue de la République' })).not.toBe(
			officeKey({ ...office, city: '' })
		);
	});
});
