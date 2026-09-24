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
exports.CreateProposalDto = void 0;
const class_validator_1 = require("class-validator");
class CreateProposalDto {
}
exports.CreateProposalDto = CreateProposalDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)()
], CreateProposalDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsString)()
], CreateProposalDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsDateString)()
], CreateProposalDto.prototype, "votingStartsAt", void 0);
__decorate([
    (0, class_validator_1.IsDateString)()
], CreateProposalDto.prototype, "votingEndsAt", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100)
], CreateProposalDto.prototype, "quorumThresholdPercent", void 0);
let CreateProposalDto = (() => {
    var _a;
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _votingStartsAt_decorators;
    let _votingStartsAt_initializers = [];
    let _votingStartsAt_extraInitializers = [];
    let _votingEndsAt_decorators;
    let _votingEndsAt_initializers = [];
    let _votingEndsAt_extraInitializers = [];
    let _quorumThresholdPercent_decorators;
    let _quorumThresholdPercent_initializers = [];
    let _quorumThresholdPercent_extraInitializers = [];
    return _a = class CreateProposalDto {
            constructor() {
                this.title = __runInitializers(this, _title_initializers, void 0);
                this.description = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _description_initializers, void 0));
                /** Voting window start (ISO 8601). */
                this.votingStartsAt = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _votingStartsAt_initializers, void 0));
                /** Voting window end (ISO 8601). Must be after votingStartsAt. */
                this.votingEndsAt = (__runInitializers(this, _votingStartsAt_extraInitializers), __runInitializers(this, _votingEndsAt_initializers, void 0));
                /** Minimum participation threshold as a percentage of eligible voters (0-100). */
                this.quorumThresholdPercent = (__runInitializers(this, _votingEndsAt_extraInitializers), __runInitializers(this, _quorumThresholdPercent_initializers, void 0));
                __runInitializers(this, _quorumThresholdPercent_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _title_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _description_decorators = [(0, class_validator_1.IsString)()];
            _votingStartsAt_decorators = [(0, class_validator_1.IsDateString)()];
            _votingEndsAt_decorators = [(0, class_validator_1.IsDateString)()];
            _quorumThresholdPercent_decorators = [(0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0), (0, class_validator_1.Max)(100)];
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _votingStartsAt_decorators, { kind: "field", name: "votingStartsAt", static: false, private: false, access: { has: obj => "votingStartsAt" in obj, get: obj => obj.votingStartsAt, set: (obj, value) => { obj.votingStartsAt = value; } }, metadata: _metadata }, _votingStartsAt_initializers, _votingStartsAt_extraInitializers);
            __esDecorate(null, null, _votingEndsAt_decorators, { kind: "field", name: "votingEndsAt", static: false, private: false, access: { has: obj => "votingEndsAt" in obj, get: obj => obj.votingEndsAt, set: (obj, value) => { obj.votingEndsAt = value; } }, metadata: _metadata }, _votingEndsAt_initializers, _votingEndsAt_extraInitializers);
            __esDecorate(null, null, _quorumThresholdPercent_decorators, { kind: "field", name: "quorumThresholdPercent", static: false, private: false, access: { has: obj => "quorumThresholdPercent" in obj, get: obj => obj.quorumThresholdPercent, set: (obj, value) => { obj.quorumThresholdPercent = value; } }, metadata: _metadata }, _quorumThresholdPercent_initializers, _quorumThresholdPercent_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.CreateProposalDto = CreateProposalDto;
