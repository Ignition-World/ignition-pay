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
exports.CastVoteDto = void 0;
const class_validator_1 = require("class-validator");
const vote_entity_1 = require("../entities/vote.entity");
class CastVoteDto {
}
exports.CastVoteDto = CastVoteDto;
__decorate([
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsNotEmpty)()
], CastVoteDto.prototype, "voterId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(vote_entity_1.VoteChoice)
], CastVoteDto.prototype, "choice", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1)
], CastVoteDto.prototype, "weight", void 0);
let CastVoteDto = (() => {
    var _a;
    let _voterId_decorators;
    let _voterId_initializers = [];
    let _voterId_extraInitializers = [];
    let _choice_decorators;
    let _choice_initializers = [];
    let _choice_extraInitializers = [];
    let _weight_decorators;
    let _weight_initializers = [];
    let _weight_extraInitializers = [];
    return _a = class CastVoteDto {
            constructor() {
                this.voterId = __runInitializers(this, _voterId_initializers, void 0);
                this.choice = (__runInitializers(this, _voterId_extraInitializers), __runInitializers(this, _choice_initializers, void 0));
                /** Optional vote weight; defaults to 1 when omitted. */
                this.weight = (__runInitializers(this, _choice_extraInitializers), __runInitializers(this, _weight_initializers, void 0));
                __runInitializers(this, _weight_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _voterId_decorators = [(0, class_validator_1.IsUUID)(), (0, class_validator_1.IsNotEmpty)()];
            _choice_decorators = [(0, class_validator_1.IsEnum)(vote_entity_1.VoteChoice)];
            _weight_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1)];
            __esDecorate(null, null, _voterId_decorators, { kind: "field", name: "voterId", static: false, private: false, access: { has: obj => "voterId" in obj, get: obj => obj.voterId, set: (obj, value) => { obj.voterId = value; } }, metadata: _metadata }, _voterId_initializers, _voterId_extraInitializers);
            __esDecorate(null, null, _choice_decorators, { kind: "field", name: "choice", static: false, private: false, access: { has: obj => "choice" in obj, get: obj => obj.choice, set: (obj, value) => { obj.choice = value; } }, metadata: _metadata }, _choice_initializers, _choice_extraInitializers);
            __esDecorate(null, null, _weight_decorators, { kind: "field", name: "weight", static: false, private: false, access: { has: obj => "weight" in obj, get: obj => obj.weight, set: (obj, value) => { obj.weight = value; } }, metadata: _metadata }, _weight_initializers, _weight_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.CastVoteDto = CastVoteDto;
