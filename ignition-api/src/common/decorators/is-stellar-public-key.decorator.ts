import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { StrKey } from '@stellar/stellar-sdk';

@ValidatorConstraint({ async: false })
export class IsStellarPublicKeyConstraint implements ValidatorConstraintInterface {
  validate(walletAddress: any) {
    if (typeof walletAddress !== 'string') return false;
    return StrKey.isValidEd25519PublicKey(walletAddress);
  }

  defaultMessage() {
    return 'Invalid Stellar wallet address';
  }
}

export function IsStellarPublicKey(validationOptions?: ValidationOptions): any {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isStellarPublicKey',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: IsStellarPublicKeyConstraint,
    });
  };
}
