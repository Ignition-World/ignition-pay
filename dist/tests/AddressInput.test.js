"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("@testing-library/react");
require("@testing-library/jest-dom");
const AddressInput_1 = require("../src/AddressInput");
describe('AddressInput', () => {
    describe('Rendering', () => {
        it('renders without crashing', () => {
            const { container } = (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            expect(container).toBeInTheDocument();
        });
        it('renders the address input element with correct type', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            expect(input).toBeInTheDocument();
            expect(input).toHaveAttribute('type', 'text');
        });
    });
    describe('User interaction', () => {
        it('updates value when user types an address', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'GAN4T6NZFY6GXKGF7K7ZNHW2JLJWR5Y3XKHDTU7XBHLTJ2KFYNOQP7J6' } });
            expect(input).toHaveValue('GAN4T6NZFY6GXKGF7K7ZNHW2JLJWR5Y3XKHDTU7XBHLTJ2KFYNOQP7J6');
        });
        it('clears input when user empties the field', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'GAAAAA' } });
            expect(input).toHaveValue('GAAAAA');
            react_1.fireEvent.change(input, { target: { value: '' } });
            expect(input).toHaveValue('');
        });
    });
    describe('Type detection and badge rendering', () => {
        it('shows G type badge when address starts with G', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'GAN4T6NZFY6GXKGF7K7ZNHW2JLJWR5Y3XKHDTU7XBHLTJ2KFYNOQP7J6' } });
            expect(react_1.screen.getByText('G')).toBeInTheDocument();
        });
        it('shows M type badge when address starts with M', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } });
            expect(react_1.screen.getByText('M')).toBeInTheDocument();
        });
        it('shows C type badge when address starts with C', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'CCW67TSZV3SSSY2Z' } });
            expect(react_1.screen.getByText('C')).toBeInTheDocument();
        });
        it('shows no badge when input is empty', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            expect(react_1.screen.queryByText('G')).not.toBeInTheDocument();
            expect(react_1.screen.queryByText('M')).not.toBeInTheDocument();
            expect(react_1.screen.queryByText('C')).not.toBeInTheDocument();
        });
        it('shows no badge for unrecognized prefixes', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'XYZ123' } });
            expect(react_1.screen.queryByText('G')).not.toBeInTheDocument();
            expect(react_1.screen.queryByText('M')).not.toBeInTheDocument();
            expect(react_1.screen.queryByText('C')).not.toBeInTheDocument();
        });
    });
    describe('Memo field visibility', () => {
        it('shows memo field for G addresses', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'GAN4T6NZFY6GXKGF7K7ZNHW2JLJWR5Y3XKHDTU7XBHLTJ2KFYNOQP7J6' } });
            expect(react_1.screen.getByPlaceholderText('Enter memo here')).toBeInTheDocument();
        });
        it('shows memo field for unrecognized prefixes', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'XYZ123' } });
            expect(react_1.screen.getByPlaceholderText('Enter memo here')).toBeInTheDocument();
        });
        it('hides memo field for M addresses', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } });
            expect(react_1.screen.queryByPlaceholderText('Enter memo here')).not.toBeInTheDocument();
        });
        it('hides memo field for C addresses', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'CCW67TSZV3SSSY2Z' } });
            expect(react_1.screen.queryByPlaceholderText('Enter memo here')).not.toBeInTheDocument();
        });
        it('hides memo field when input is empty', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            expect(react_1.screen.queryByPlaceholderText('Enter memo here')).not.toBeInTheDocument();
        });
    });
    describe('Warning behavior', () => {
        it('shows contract warning for C addresses', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'CCW67TSZV3SSSY2Z' } });
            expect(react_1.screen.getByText(/Contract addresses cannot be used/i)).toBeInTheDocument();
        });
        it('does not show contract warning for G addresses', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'GAN4T6NZFY6GXKGF7K7ZNHW2JLJWR5Y3XKHDTU7XBHLTJ2KFYNOQP7J6' } });
            expect(react_1.screen.queryByText(/Contract addresses cannot be used/i)).not.toBeInTheDocument();
        });
        it('does not show contract warning for empty input', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            expect(react_1.screen.queryByText(/Contract addresses cannot be used/i)).not.toBeInTheDocument();
        });
    });
    describe('Accessibility', () => {
        it('input has the correct placeholder text', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText('Paste Stellar address (G..., M..., C...)');
            expect(input).toBeInTheDocument();
        });
        it('input can be focused', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            input.focus();
            expect(input).toHaveFocus();
        });
        it('memo field can be typed into when visible', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const addressInput = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(addressInput, { target: { value: 'GAN4T6NZFY6GXKGF7K7ZNHW2JLJWR5Y3XKHDTU7XBHLTJ2KFYNOQP7J6' } });
            const memoInput = react_1.screen.getByPlaceholderText('Enter memo here');
            expect(memoInput).toBeInTheDocument();
            react_1.fireEvent.change(memoInput, { target: { value: 'Test memo content' } });
            expect(memoInput).toHaveValue('Test memo content');
        });
    });
    describe('Case insensitivity for prefix detection', () => {
        it('detects lowercase g as G type', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'gan4t6nzfy6gxkgf7k7znhw2jljwr5y3xkhdtu7xbhl1tj2kfynoqp7j6' } });
            expect(react_1.screen.getByText('G')).toBeInTheDocument();
        });
        it('detects lowercase m as M type', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'maaaaaa' } });
            expect(react_1.screen.getByText('M')).toBeInTheDocument();
        });
        it('detects lowercase c as C type', () => {
            (0, react_1.render)((0, jsx_runtime_1.jsx)(AddressInput_1.AddressInput, {}));
            const input = react_1.screen.getByPlaceholderText(/Paste Stellar address/i);
            react_1.fireEvent.change(input, { target: { value: 'ccw67tszv3sssy2z' } });
            expect(react_1.screen.getByText('C')).toBeInTheDocument();
            expect(react_1.screen.getByText(/Contract addresses cannot be used/i)).toBeInTheDocument();
        });
    });
});
