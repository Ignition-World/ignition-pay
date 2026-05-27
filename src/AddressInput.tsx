import React, { useState, ChangeEvent, useEffect } from "react";
import { useAddressValidation } from "./hooks/useAddressValidation";
import { AddressValidationResult } from "./types";

interface AddressInputProps {
  onResult?: (result: AddressValidationResult) => void;
  label?: string;
  placeholder?: string;
}

export const AddressInput: React.FC<AddressInputProps> = ({
  onResult,
  label = "Stellar Address",
  placeholder = "Enter G..., M..., or C... address",
}) => {
  const [address, setAddress] = useState("");
  const validationResult = useAddressValidation(address);

  useEffect(() => {
    if (onResult) {
      onResult(validationResult);
    }
  }, [validationResult, onResult]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAddress(e.target.value);
  };

  const getStatusColor = () => {
    switch (validationResult.type) {
      case "G": return "#52c41a";
      case "M": return "#1890ff";
      case "C": return "#faad14";
      case "invalid": return address ? "#ff4d4f" : "#d9d9d9";
      default: return "#d9d9d9";
    }
  };

  return (
    <div className="address-container">
      {label && <label className="input-label">{label}</label>}
      <div className="input-wrapper">
        <input
          type="text"
          value={address}
          onChange={handleChange}
          placeholder={placeholder}
          className={`address-input ${validationResult.isValid ? 'valid' : address ? 'invalid' : ''}`}
          style={{ borderColor: getStatusColor(), boxShadow: `0 0 0 4px ${getStatusColor()}1a` }}
        />
        <div className="status-indicator">
          {address && (
            <div className={`indicator-dot ${validationResult.type}`} 
                 style={{ backgroundColor: getStatusColor() }} />
          )}
        </div>
      </div>
      
      <div className="result-panel">
        {address && (
          <div className="detection-row">
            <span className="type-label">Detected Type:</span>
            <span className={`type-tag ${validationResult.type}`}
                  style={{ color: getStatusColor(), borderColor: getStatusColor() }}>
              {validationResult.type.toUpperCase()}
            </span>
          </div>
        )}

        {validationResult.muxedId && (
          <div className="id-row">
            <span className="id-label">Muxed ID:</span>
            <code className="id-value">{validationResult.muxedId}</code>
          </div>
        )}

        {validationResult.warnings && (
          <div className="warnings-list">
            {validationResult.warnings.map((w, i) => (
              <div key={i} className="warning-item">
                <span className="warning-icon">⚠️</span>
                {w}
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .address-container {
          max-width: 500px;
          font-family: 'Inter', -apple-system, sans-serif;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #ffffff;
          padding: 24px;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        .input-label {
          font-weight: 600;
          color: #1a1a1a;
          font-size: 14px;
        }
        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .address-input {
          width: 100%;
          padding: 12px 16px;
          padding-right: 40px;
          border: 2px solid #e8e8e8;
          border-radius: 8px;
          font-size: 15px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          outline: none;
        }
        .address-input:focus {
          box-shadow: 0 0 0 4px rgba( status_color , 0.1);
        }
        .status-indicator {
          position: absolute;
          right: 14px;
          display: flex;
          align-items: center;
        }
        .indicator-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          transition: transform 0.3s ease;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        .result-panel {
          font-size: 13px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .detection-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .type-tag {
          padding: 2px 8px;
          border: 1px solid;
          border-radius: 4px;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
        }
        .id-row {
          background: #f8f9fa;
          padding: 8px 12px;
          border-radius: 6px;
          border-left: 3px solid #1890ff;
        }
        .id-label {
          font-weight: 600;
          margin-right: 8px;
          color: #444;
        }
        .id-value {
          font-family: 'Roboto Mono', monospace;
          color: #1a1a1a;
        }
        .warnings-list {
          margin-top: 4px;
        }
        .warning-item {
          color: #faad14;
          background: rgba(250, 173, 20, 0.05);
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid rgba(250, 173, 20, 0.2);
          display: flex;
          align-items: center;
          gap: 8px;
        }
      `}</style>
    </div>
  );
};
