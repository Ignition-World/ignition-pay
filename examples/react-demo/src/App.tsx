import { AddressInput } from '../../../src/AddressInput'
import './App.css'

function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ padding: '2rem', background: 'white', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', width: '100%', maxWidth: '400px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#1e293b' }}>Stellar Address Kit</h1>
        <AddressInput />
      </div>
    </div>
  )
}

export default App
