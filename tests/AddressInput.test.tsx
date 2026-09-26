/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AddressInput } from '../src/AddressInput';

describe('AddressInput', () => {
  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { container } = render(<AddressInput />);
      expect(container).toBeInTheDocument();
    });

    it('renders the address input element with correct type', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'text');
    });
  });

  describe('User interaction', () => {
    it('updates value when user types an address', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'GAN4T6NZFY6GXKGF7K7ZNHW2JLJWR5Y3XKHDTU7XBHLTJ2KFYNOQP7J6' } });
      expect(input).toHaveValue('GAN4T6NZFY6GXKGF7K7ZNHW2JLJWR5Y3XKHDTU7XBHLTJ2KFYNOQP7J6');
    });

    it('clears input when user empties the field', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'GAAAAA' } });
      expect(input).toHaveValue('GAAAAA');
      fireEvent.change(input, { target: { value: '' } });
      expect(input).toHaveValue('');
    });
  });

  describe('Type detection and badge rendering', () => {
    it('shows G type badge when address starts with G', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'GAN4T6NZFY6GXKGF7K7ZNHW2JLJWR5Y3XKHDTU7XBHLTJ2KFYNOQP7J6' } });
      expect(screen.getByText('G')).toBeInTheDocument();
    });

    it('shows M type badge when address starts with M', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } });
      expect(screen.getByText('M')).toBeInTheDocument();
    });

    it('shows C type badge when address starts with C', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'CCW67TSZV3SSSY2Z' } });
      expect(screen.getByText('C')).toBeInTheDocument();
    });

    it('shows no badge when input is empty', () => {
      render(<AddressInput />);
      expect(screen.queryByText('G')).not.toBeInTheDocument();
      expect(screen.queryByText('M')).not.toBeInTheDocument();
      expect(screen.queryByText('C')).not.toBeInTheDocument();
    });

    it('shows no badge for unrecognized prefixes', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'XYZ123' } });
      expect(screen.queryByText('G')).not.toBeInTheDocument();
      expect(screen.queryByText('M')).not.toBeInTheDocument();
      expect(screen.queryByText('C')).not.toBeInTheDocument();
    });
  });

  describe('Memo field visibility', () => {
    it('shows memo field for G addresses', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'GAN4T6NZFY6GXKGF7K7ZNHW2JLJWR5Y3XKHDTU7XBHLTJ2KFYNOQP7J6' } });
      expect(screen.getByPlaceholderText('Enter memo here')).toBeInTheDocument();
    });

    it('shows memo field for unrecognized prefixes', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'XYZ123' } });
      expect(screen.getByPlaceholderText('Enter memo here')).toBeInTheDocument();
    });

    it('hides memo field for M addresses', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } });
      expect(screen.queryByPlaceholderText('Enter memo here')).not.toBeInTheDocument();
    });

    it('hides memo field for C addresses', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'CCW67TSZV3SSSY2Z' } });
      expect(screen.queryByPlaceholderText('Enter memo here')).not.toBeInTheDocument();
    });

    it('hides memo field when input is empty', () => {
      render(<AddressInput />);
      expect(screen.queryByPlaceholderText('Enter memo here')).not.toBeInTheDocument();
    });
  });

  describe('Warning behavior', () => {
    it('shows contract warning for C addresses', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'CCW67TSZV3SSSY2Z' } });
      expect(screen.getByText(/Contract addresses cannot be used/i)).toBeInTheDocument();
    });

    it('does not show contract warning for G addresses', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'GAN4T6NZFY6GXKGF7K7ZNHW2JLJWR5Y3XKHDTU7XBHLTJ2KFYNOQP7J6' } });
      expect(screen.queryByText(/Contract addresses cannot be used/i)).not.toBeInTheDocument();
    });

    it('does not show contract warning for empty input', () => {
      render(<AddressInput />);
      expect(screen.queryByText(/Contract addresses cannot be used/i)).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('input has the correct placeholder text', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText('Paste Stellar address (G..., M..., C...)');
      expect(input).toBeInTheDocument();
    });

    it('input can be focused', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      input.focus();
      expect(input).toHaveFocus();
    });

    it('memo field can be typed into when visible', () => {
      render(<AddressInput />);
      const addressInput = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(addressInput, { target: { value: 'GAN4T6NZFY6GXKGF7K7ZNHW2JLJWR5Y3XKHDTU7XBHLTJ2KFYNOQP7J6' } });

      const memoInput = screen.getByPlaceholderText('Enter memo here');
      expect(memoInput).toBeInTheDocument();
      fireEvent.change(memoInput, { target: { value: 'Test memo content' } });
      expect(memoInput).toHaveValue('Test memo content');
    });
  });

  describe('Case insensitivity for prefix detection', () => {
    it('detects lowercase g as G type', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'gan4t6nzfy6gxkgf7k7znhw2jljwr5y3xkhdtu7xbhl1tj2kfynoqp7j6' } });
      expect(screen.getByText('G')).toBeInTheDocument();
    });

    it('detects lowercase m as M type', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'maaaaaa' } });
      expect(screen.getByText('M')).toBeInTheDocument();
    });

    it('detects lowercase c as C type', () => {
      render(<AddressInput />);
      const input = screen.getByPlaceholderText(/Paste Stellar address/i);
      fireEvent.change(input, { target: { value: 'ccw67tszv3sssy2z' } });
      expect(screen.getByText('C')).toBeInTheDocument();
      expect(screen.getByText(/Contract addresses cannot be used/i)).toBeInTheDocument();
    });
  });
});
