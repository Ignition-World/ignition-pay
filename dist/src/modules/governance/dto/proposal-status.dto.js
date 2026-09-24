"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProposalResultsDto = void 0;
const class_validator_1 = require("class-validator");
/**
 * Read-only view of a proposal's current tally, participation and
 * quorum status.
 */
class ProposalResultsDto {
}
exports.ProposalResultsDto = ProposalResultsDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0)
], ProposalResultsDto.prototype, "totalVotes", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100)
], ProposalResultsDto.prototype, "participationPercent", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)()
], ProposalResultsDto.prototype, "quorumMet", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0)
], ProposalResultsDto.prototype, "requiredVotes", void 0);
let ProposalResultsDto = (() => {
    var _a;
    let _totalVotes_decorators;
    let _totalVotes_initializers = [];
    let _totalVotes_extraInitializers = [];
    let _participationPercent_decorators;
    let _participationPercent_initializers = [];
    let _participationPercent_extraInitializers = [];
    let _quorumMet_decorators;
    let _quorumMet_initializers = [];
    let _quorumMet_extraInitializers = [];
    let _requiredVotes_decorators;
    let _requiredVotes_initializers = [];
    let _requiredVotes_extraInitializers = [];
    return _a = class ProposalResultsDto {
            constructor() {
                this.totalVotes = __runInitializers(this, _totalVotes_initializers, void 0);
                this.participationPercent = (__runInitializers(this, _totalVotes_extraInitializers), __runInitializers(this, _participationPercent_initializers, void 0));
                this.quorumMet = (__runInitializers(this, _participationPercent_extraInitializers), __runInitializers(this, _quorumMet_initializers, void 0));
                this.requiredVotes = (__runInitializers(this, _quorumMet_extraInitializers), __runInitializers(this, _requiredVotes_initializers, void 0));
                __runInitializers(this, _requiredVotes_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _totalVotes_decorators = [(0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0)];
            _participationPercent_decorators = [(0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0), (0, class_validator_1.Max)(100)];
            _quorumMet_decorators = [(0, class_validator_1.IsBoolean)()];
            _requiredVotes_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0)];
            __esDecorate(null, null, _totalVotes_decorators, { kind: "field", name: "totalVotes", static: false, private: false, access: { has: obj => "totalVotes" in obj, get: obj => obj.totalVotes, set: (obj, value) => { obj.totalVotes = value; } }, metadata: _metadata }, _totalVotes_initializers, _totalVotes_extraInitializers);
            __esDecorate(null, null, _participationPercent_decorators, { kind: "field", name: "participationPercent", static: false, private: false, access: { has: obj => "participationPercent" in obj, get: obj => obj.participationPercent, set: (obj, value) => { obj.participationPercent = value; } }, metadata: _metadata }, _participationPercent_initializers, _participationPercent_extraInitializers);
            __esDecorate(null, null, _quorumMet_decorators, { kind: "field", name: "quorumMet", static: false, private: false, access: { has: obj => "quorumMet" in obj, get: obj => obj.quorumMet, set: (obj, value) => { obj.quorumMet = value; } }, metadata: _metadata }, _quorumMet_initializers, _quorumMet_extraInitializers);
            __esDecorate(null, null, _requiredVotes_decorators, { kind: "field", name: "requiredVotes", static: false, private: false, access: { has: obj => "requiredVotes" in obj, get: obj => obj.requiredVotes, set: (obj, value) => { obj.requiredVotes = value; } }, metadata: _metadata }, _requiredVotes_initializers, _requiredVotes_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.ProposalResultsDto = ProposalResultsDto;
