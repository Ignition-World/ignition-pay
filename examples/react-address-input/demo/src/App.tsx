import React, { useState } from 'react';
import { AddressInput } from 'react-address-input';

function App() {
  const [result, setResult] = useState<any>(null);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-8">
          react-address-input Demo
        </h1>
        <div className="bg-white p-6 rounded-xl shadow-md space-y-6">
          <AddressInput 
            onResult={(res) => setResult(res)} 
            placeholder="Enter Stellar address..."
          />
          
          <div className="mt-8">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Output Result:</h3>
            <pre className="bg-gray-100 p-4 rounded-md overflow-auto text-sm text-gray-800 h-32">
              {result ? JSON.stringify(result, null, 2) : 'Type something to see output...'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
