'use client';
// version 1.0

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface OptionResults {
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

interface Results {
  call: OptionResults;
  put: OptionResults;
  timeToExpiry: number;
}

interface ChartDataPoint {
  spot: string;
  callPayoff: number;
  putPayoff: number;
  callCurrent: number;
  putCurrent: number;
  callIntrinsic: number;
  putIntrinsic: number;
  callDelta: number;
  putDelta: number;
  gamma: number;
  vega: number;
}

export default function OptionCalculator() {
  const today = new Date().toISOString().split('T')[0];
  const oneYearFromNow = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];
  
  const [inputs, setInputs] = useState({
    spotPrice: 100,
    strikePrice: 100,
    valuationDate: today,
    exerciseDate: oneYearFromNow,
    volatility: 25,
    riskFreeRate: 5.0,
    dividendYield: 0
  });

  const [results, setResults] = useState<Results | null>(null);
  const [optionType, setOptionType] = useState<'call' | 'put'>('call');
  const [position, setPosition] = useState<'long' | 'short'>('long');
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [mode, setMode] = useState<'price' | 'iv'>('price');
  const [marketPrice, setMarketPrice] = useState<string>('');

  const normalCDF = (x: number): number => {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - prob : prob;
  };

  const normalPDF = (x: number): number => {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  };

  const calculateTimeToExpiry = (): number => {
    const valDate = new Date(inputs.valuationDate);
    const exDate = new Date(inputs.exerciseDate);
    const diffTime = exDate.getTime() - valDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return Math.max(diffDays / 365.25, 0.001);
  };

  const calculateBlackScholes = (): { callPrice: number; putPrice: number } | null => {
    const S = inputs.spotPrice;
    const K = inputs.strikePrice;
    const T = calculateTimeToExpiry();
    const sigma = inputs.volatility / 100;
    const r = inputs.riskFreeRate / 100;
    const q = inputs.dividendYield / 100;

    if (T <= 0) return null;

    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const callPrice = S * Math.exp(-q * T) * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    const putPrice = K * Math.exp(-r * T) * normalCDF(-d2) - S * Math.exp(-q * T) * normalCDF(-d1);

    const delta_call = Math.exp(-q * T) * normalCDF(d1);
    const delta_put = -Math.exp(-q * T) * normalCDF(-d1);
    
    const gamma = Math.exp(-q * T) * normalPDF(d1) / (S * sigma * Math.sqrt(T));
    const vega = S * Math.exp(-q * T) * normalPDF(d1) * Math.sqrt(T) / 100;
    
    const theta_call = (-S * normalPDF(d1) * sigma * Math.exp(-q * T) / (2 * Math.sqrt(T)) 
                       - r * K * Math.exp(-r * T) * normalCDF(d2)
                       + q * S * Math.exp(-q * T) * normalCDF(d1)) / 365;
    
    const theta_put = (-S * normalPDF(d1) * sigma * Math.exp(-q * T) / (2 * Math.sqrt(T))
                      + r * K * Math.exp(-r * T) * normalCDF(-d2)
                      - q * S * Math.exp(-q * T) * normalCDF(-d1)) / 365;

    setResults({
      call: {
        price: callPrice,
        delta: delta_call,
        gamma: gamma,
        vega: vega,
        theta: theta_call
      },
      put: {
        price: putPrice,
        delta: delta_put,
        gamma: gamma,
        vega: vega,
        theta: theta_put
      },
      timeToExpiry: T
    });

    generateChartData(S, K, T, sigma, r, q, callPrice, putPrice);
    
    return { callPrice, putPrice };
  };

  const generateChartData = (S: number, K: number, T: number, sigma: number, r: number, q: number, callPrice: number, putPrice: number): void => {
    const data: ChartDataPoint[] = [];
    const range = S * 0.5;
    const step = range / 100;
    
    const posMultiplier = position === 'long' ? 1 : -1;
    
    for (let spot = Math.max(1, S - range); spot <= S + range; spot += step) {
      const d1_spot = (Math.log(spot / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
      const d2_spot = d1_spot - sigma * Math.sqrt(T);
      
      const callCurrentValue = spot * Math.exp(-q * T) * normalCDF(d1_spot) - K * Math.exp(-r * T) * normalCDF(d2_spot);
      const putCurrentValue = K * Math.exp(-r * T) * normalCDF(-d2_spot) - spot * Math.exp(-q * T) * normalCDF(-d1_spot);
      
      const callIntrinsic = Math.max(0, spot - K);
      const putIntrinsic = Math.max(0, K - spot);
      
      const callPayoff = (callIntrinsic - callPrice) * posMultiplier;
      const putPayoff = (putIntrinsic - putPrice) * posMultiplier;
      
      const callCurrentPnL = (callCurrentValue - callPrice) * posMultiplier;
      const putCurrentPnL = (putCurrentValue - putPrice) * posMultiplier;
      
      const delta_call = Math.exp(-q * T) * normalCDF(d1_spot);
      const delta_put = -Math.exp(-q * T) * normalCDF(-d1_spot);
      const gamma = Math.exp(-q * T) * normalPDF(d1_spot) / (spot * sigma * Math.sqrt(T));
      const vega = spot * Math.exp(-q * T) * normalPDF(d1_spot) * Math.sqrt(T) / 100;
      
      data.push({
        spot: spot.toFixed(2),
        callPayoff: callPayoff,
        putPayoff: putPayoff,
        callCurrent: callCurrentPnL,
        putCurrent: putCurrentPnL,
        callIntrinsic: callIntrinsic * posMultiplier,
        putIntrinsic: putIntrinsic * posMultiplier,
        callDelta: delta_call,
        putDelta: delta_put,
        gamma: gamma,
        vega: vega
      });
    }
    
    setChartData(data);
  };

  const calculateImpliedVolatility = (): void => {
    const targetPrice = parseFloat(marketPrice);
    if (isNaN(targetPrice) || targetPrice <= 0) {
      alert('Please enter a valid option price');
      return;
    }

    const S = inputs.spotPrice;
    const K = inputs.strikePrice;
    const T = calculateTimeToExpiry();
    const r = inputs.riskFreeRate / 100;
    const q = inputs.dividendYield / 100;

    if (T <= 0) {
      alert('Exercise date must be after valuation date');
      return;
    }

    const intrinsicValue = optionType === 'call' 
      ? Math.max(0, S * Math.exp(-q * T) - K * Math.exp(-r * T))
      : Math.max(0, K * Math.exp(-r * T) - S * Math.exp(-q * T));
    
    if (targetPrice < intrinsicValue) {
      alert(`Price ($${targetPrice.toFixed(2)}) is below intrinsic value ($${intrinsicValue.toFixed(2)})`);
      return;
    }

    let sigma = 0.3;
    const maxIterations = 100;
    const tolerance = 0.0001;

    for (let i = 0; i < maxIterations; i++) {
      const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);

      const price = optionType === 'call'
        ? S * Math.exp(-q * T) * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2)
        : K * Math.exp(-r * T) * normalCDF(-d2) - S * Math.exp(-q * T) * normalCDF(-d1);

      const vega = S * Math.exp(-q * T) * normalPDF(d1) * Math.sqrt(T);
      const diff = price - targetPrice;

      if (Math.abs(diff) < tolerance) {
        const impliedVol = sigma * 100;
        setInputs(prev => ({ ...prev, volatility: impliedVol }));
        
        const d1_final = d1;
        const d2_final = d2;
        
        const callPrice = S * Math.exp(-q * T) * normalCDF(d1_final) - K * Math.exp(-r * T) * normalCDF(d2_final);
        const putPrice = K * Math.exp(-r * T) * normalCDF(-d2_final) - S * Math.exp(-q * T) * normalCDF(-d1_final);

        const delta_call = Math.exp(-q * T) * normalCDF(d1_final);
        const delta_put = -Math.exp(-q * T) * normalCDF(-d1_final);
        
        const gamma = Math.exp(-q * T) * normalPDF(d1_final) / (S * sigma * Math.sqrt(T));
        const vega_final = S * Math.exp(-q * T) * normalPDF(d1_final) * Math.sqrt(T) / 100;
        
        const theta_call = (-S * normalPDF(d1_final) * sigma * Math.exp(-q * T) / (2 * Math.sqrt(T)) 
                           - r * K * Math.exp(-r * T) * normalCDF(d2_final)
                           + q * S * Math.exp(-q * T) * normalCDF(d1_final)) / 365;
        
        const theta_put = (-S * normalPDF(d1_final) * sigma * Math.exp(-q * T) / (2 * Math.sqrt(T))
                          + r * K * Math.exp(-r * T) * normalCDF(-d2_final)
                          - q * S * Math.exp(-q * T) * normalCDF(-d1_final)) / 365;

        setResults({
          call: {
            price: callPrice,
            delta: delta_call,
            gamma: gamma,
            vega: vega_final,
            theta: theta_call
          },
          put: {
            price: putPrice,
            delta: delta_put,
            gamma: gamma,
            vega: vega_final,
            theta: theta_put
          },
          timeToExpiry: T
        });

        generateChartData(S, K, T, sigma, r, q, callPrice, putPrice);
        return;
      }

      sigma = sigma - diff / vega;

      if (sigma < 0.001) sigma = 0.001;
      if (sigma > 5) sigma = 5;
    }

    alert('IV calculation did not converge. Try a different price.');
  };

  useEffect(() => {
    if (mode === 'price') {
      calculateBlackScholes();
    }
  }, [inputs, optionType, mode, position]);

  const handleInputChange = (field: string, value: number | string): void => {
    setInputs(prev => ({ ...prev, [field]: value }));
  };

  const currentResults = results ? results[optionType] : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)',
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      color: '#e0e6ed',
      padding: '1rem'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        * {
          box-sizing: border-box;
        }
        
        .card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.5rem;
          backdrop-filter: blur(10px);
        }
        
        .input-field {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #e0e6ed;
          padding: 0.75rem 1rem;
          font-size: 1rem;
          border-radius: 6px;
          font-family: inherit;
        }
        
        .input-field:focus {
          outline: none;
          border-color: #00d4ff;
          background: rgba(0, 212, 255, 0.1);
        }
        
        .btn {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          font-family: inherit;
        }
        
        .btn-primary {
          background: #00d4ff;
          color: #0a0e27;
          flex: 1;
        }
        
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 212, 255, 0.4);
        }
        
        .btn-primary.active {
          background: #00ff88;
        }
        
        .main-grid {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 2rem;
        }
        
        @media (max-width: 1200px) {
          .main-grid {
            grid-template-columns: 320px 1fr;
            gap: 1.5rem;
          }
        }
        
        @media (max-width: 968px) {
          .main-grid {
            grid-template-columns: 1fr;
            gap: 2rem;
          }
        }
        
        .charts-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }
        
        @media (max-width: 768px) {
          .charts-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
        }
      `}</style>

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ 
            fontSize: 'clamp(2rem, 5vw, 3.5rem)', 
            fontWeight: 700, 
            margin: 0,
            background: 'linear-gradient(90deg, #00d4ff, #00ff88)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            OPTION ANALYTIC
          </h1>
          <p style={{ 
            color: 'rgba(255, 255, 255, 0.6)', 
            fontSize: 'clamp(0.9rem, 2vw, 1.1rem)',
            marginTop: '0.5rem',
            padding: '0 1rem'
          }}>
            Black-Scholes Options Pricing & Greeks
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <button 
            className={`btn btn-primary ${optionType === 'call' ? 'active' : ''}`}
            onClick={() => setOptionType('call')}
          >
            CALL OPTION
          </button>
          <button 
            className={`btn btn-primary ${optionType === 'put' ? 'active' : ''}`}
            onClick={() => setOptionType('put')}
          >
            PUT OPTION
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <button 
            className={`btn btn-primary ${position === 'long' ? 'active' : ''}`}
            onClick={() => setPosition('long')}
            style={{ fontSize: '0.9rem' }}
          >
            LONG (BUY)
          </button>
          <button 
            className={`btn btn-primary ${position === 'short' ? 'active' : ''}`}
            onClick={() => setPosition('short')}
            style={{ fontSize: '0.9rem' }}
          >
            SHORT (SELL)
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button 
            className={`btn btn-primary ${mode === 'price' ? 'active' : ''}`}
            onClick={() => setMode('price')}
            style={{ fontSize: '0.85rem' }}
          >
            CALCULATE PRICE
          </button>
          <button 
            className={`btn btn-primary ${mode === 'iv' ? 'active' : ''}`}
            onClick={() => setMode('iv')}
            style={{ fontSize: '0.85rem' }}
          >
            CALCULATE IV
          </button>
        </div>

        <div className="main-grid">
          <div>
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', color: '#00d4ff' }}>
                PARAMETERS
              </h3>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>
                  Spot Price
                </label>
                <input 
                  className="input-field"
                  type="number" 
                  value={inputs.spotPrice}
                  onChange={(e) => handleInputChange('spotPrice', parseFloat(e.target.value) || 0)}
                  step="0.01"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>
                  Strike Price
                </label>
                <input 
                  className="input-field"
                  type="number" 
                  value={inputs.strikePrice}
                  onChange={(e) => handleInputChange('strikePrice', parseFloat(e.target.value) || 0)}
                  step="0.01"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>
                  Valuation Date
                </label>
                <input 
                  className="input-field"
                  type="date" 
                  value={inputs.valuationDate}
                  onChange={(e) => handleInputChange('valuationDate', e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>
                  Exercise Date
                </label>
                <input 
                  className="input-field"
                  type="date" 
                  value={inputs.exerciseDate}
                  onChange={(e) => handleInputChange('exerciseDate', e.target.value)}
                />
              </div>

              {mode === 'price' ? (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>
                    Volatility (%)
                  </label>
                  <input 
                    className="input-field"
                    type="number" 
                    value={inputs.volatility}
                    onChange={(e) => handleInputChange('volatility', parseFloat(e.target.value) || 0)}
                    step="0.1"
                  />
                </div>
              ) : (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>
                    Market Option Price
                  </label>
                  <input 
                    className="input-field"
                    type="number" 
                    value={marketPrice}
                    onChange={(e) => setMarketPrice(e.target.value)}
                    step="0.01"
                    placeholder="Enter market price"
                  />
                  <button 
                    onClick={calculateImpliedVolatility}
                    style={{
                      marginTop: '0.75rem',
                      width: '100%',
                      padding: '0.75rem',
                      background: '#00ff88',
                      border: 'none',
                      color: '#0a0e27',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 255, 136, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    CALCULATE IV →
                  </button>
                  {inputs.volatility > 0 && (
                    <div style={{
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      background: 'rgba(0, 255, 136, 0.1)',
                      border: '1px solid rgba(0, 255, 136, 0.3)',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      textAlign: 'center'
                    }}>
                      Implied Vol: <strong>{inputs.volatility.toFixed(2)}%</strong>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>
                  Risk-Free Rate (%)
                </label>
                <input 
                  className="input-field"
                  type="number" 
                  value={inputs.riskFreeRate}
                  onChange={(e) => handleInputChange('riskFreeRate', parseFloat(e.target.value) || 0)}
                  step="0.01"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>
                  Dividend Yield (%)
                </label>
                <input 
                  className="input-field"
                  type="number" 
                  value={inputs.dividendYield}
                  onChange={(e) => handleInputChange('dividendYield', parseFloat(e.target.value) || 0)}
                  step="0.01"
                />
              </div>
            </div>

            {currentResults && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', color: '#00d4ff' }}>
                  RESULTS
                </h3>
                
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#00ff88', marginBottom: '0.5rem' }}>
                    {position === 'long' ? 'OPTION PRICE (YOU PAY)' : 'OPTION PRICE (YOU RECEIVE)'}
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>
                    ${currentResults.price.toFixed(4)}
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'rgba(255,255,255,0.5)', 
                    marginTop: '0.5rem',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.5rem'
                  }}>
                    <div>Time: {results?.timeToExpiry.toFixed(2)} years</div>
                    <div>Days: {Math.round((results?.timeToExpiry || 0) * 365.25)}</div>
                  </div>
                </div>

                <div style={{ 
                  padding: '0.75rem', 
                  background: position === 'long' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 136, 0, 0.1)',
                  borderRadius: '6px',
                  marginBottom: '1.5rem',
                  fontSize: '0.85rem',
                  textAlign: 'center',
                  fontWeight: 600
                }}>
                  {position === 'long' ? '📈 LONG POSITION (Buyer)' : '📉 SHORT POSITION (Seller)'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.3rem' }}>Delta</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {(currentResults.delta * (position === 'long' ? 1 : -1)).toFixed(4)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.3rem' }}>Gamma</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {(currentResults.gamma * (position === 'long' ? 1 : -1)).toFixed(6)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.3rem' }}>Vega</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {(currentResults.vega * (position === 'long' ? 1 : -1)).toFixed(4)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.3rem' }}>Theta</div>
                    <div style={{ 
                      fontSize: '1.1rem', 
                      fontWeight: 600, 
                      color: (currentResults.theta * (position === 'long' ? 1 : -1)) < 0 ? '#ff5555' : '#00ff88' 
                    }}>
                      {(currentResults.theta * (position === 'long' ? 1 : -1)).toFixed(4)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#00d4ff' }}>
                PAYOFF DIAGRAM
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '1rem' }}>
                Green = Current P&L (with time value) | Cyan = Payoff at Expiry | Blue Dashed = Intrinsic Value (no premium)
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                  <XAxis dataKey="spot" stroke="#e0e6ed" style={{ fontSize: '0.75rem' }} />
                  <YAxis stroke="#e0e6ed" style={{ fontSize: '0.75rem' }} />
                  <Tooltip 
                    contentStyle={{ 
                      background: 'rgba(10, 14, 39, 0.95)', 
                      border: '1px solid #00d4ff', 
                      fontSize: '0.75rem' 
                    }} 
                    formatter={(value: any) => typeof value === 'number' ? value.toFixed(2) : value}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
                  <Line 
                    type="monotone" 
                    dataKey={optionType === 'call' ? 'callCurrent' : 'putCurrent'} 
                    stroke="#00ff88" 
                    strokeWidth={3} 
                    dot={false} 
                    name="Current P&L" 
                  />
                  <Line 
                    type="monotone" 
                    dataKey={optionType === 'call' ? 'callPayoff' : 'putPayoff'} 
                    stroke="#00c8ff" 
                    strokeWidth={2} 
                    dot={false} 
                    name="Payoff at Expiry" 
                  />
                  <Line 
                    type="monotone" 
                    dataKey={optionType === 'call' ? 'callIntrinsic' : 'putIntrinsic'} 
                    stroke="#4080ff" 
                    strokeWidth={1.5} 
                    strokeDasharray="5 5" 
                    dot={false} 
                    name="Intrinsic Value" 
                  />
                  <Line 
                    type="monotone" 
                    dataKey={() => 0}
                    stroke="rgba(255, 255, 255, 0.3)" 
                    strokeWidth={1} 
                    strokeDasharray="2 2" 
                    dot={false} 
                    name="" 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="charts-grid" style={{ marginTop: '1.5rem', gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="card">
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.8rem', color: '#00d4ff' }}>DELTA</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                    <XAxis dataKey="spot" stroke="#e0e6ed" style={{ fontSize: '0.7rem' }} />
                    <YAxis stroke="#e0e6ed" style={{ fontSize: '0.7rem' }} />
                    <Tooltip contentStyle={{ background: 'rgba(10, 14, 39, 0.95)', border: '1px solid #00d4ff', fontSize: '0.7rem' }} />
                    <Line type="monotone" dataKey={optionType === 'call' ? 'callDelta' : 'putDelta'} stroke="#00ff88" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.8rem', color: '#00d4ff' }}>GAMMA</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                    <XAxis dataKey="spot" stroke="#e0e6ed" style={{ fontSize: '0.7rem' }} />
                    <YAxis stroke="#e0e6ed" style={{ fontSize: '0.7rem' }} />
                    <Tooltip contentStyle={{ background: 'rgba(10, 14, 39, 0.95)', border: '1px solid #00d4ff', fontSize: '0.7rem' }} />
                    <Line type="monotone" dataKey="gamma" stroke="#ffaa00" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.8rem', color: '#00d4ff' }}>VEGA</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                    <XAxis dataKey="spot" stroke="#e0e6ed" style={{ fontSize: '0.7rem' }} />
                    <YAxis stroke="#e0e6ed" style={{ fontSize: '0.7rem' }} />
                    <Tooltip contentStyle={{ background: 'rgba(10, 14, 39, 0.95)', border: '1px solid #00d4ff', fontSize: '0.7rem' }} />
                    <Line type="monotone" dataKey="vega" stroke="#ff00ff" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <div style={{ 
          textAlign: 'center', 
          marginTop: '4rem', 
          paddingTop: '2rem', 
          borderTop: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.5)',
          fontSize: '0.9rem'
        }}>
          Option Analytic © 2024 | Black-Scholes Options Pricing
        </div>
      </div>
    </div>
  );
}