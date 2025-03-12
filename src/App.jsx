import React, { useState, useEffect, useRef } from 'react';

function App() {
  const [threshold, setThreshold] = useState(100);
  const [transactions, setTransactions] = useState([]);
  const [isWatching, setIsWatching] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef(null);

  useEffect(() => {
    ws.current = new WebSocket('ws://localhost:8080/ws');

    ws.current.onopen = () => {
      setIsConnected(true);
      console.log('Connected to WebSocket server');
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log("Received message:", message);

      if (message.type === 'transaction') {
        setTransactions((prevTransactions) => [message.data, ...prevTransactions]);
        console.log("Transactions state updated:", transactions);
      } else if (message.type === 'status') {
        setIsWatching(message.data.isWatching);
        setThreshold(message.data.threshold);
      } else if (message.type === 'error') {
        console.error("Received error:", message.data)
      }
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      setIsWatching(false)
      console.log('Disconnected from WebSocket server');
    };

    ws.current.onerror = (error) => {
      setIsConnected(false);
      console.error("Websocket error", error)
    }

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const handleStart = () => {
    if (ws.current && isConnected) {
      ws.current.send(JSON.stringify({ type: 'start', threshold }));
      setIsWatching(true);
    }
  };

  const handleStop = () => {
    if (ws.current && isConnected) {
      ws.current.send(JSON.stringify({ type: 'stop' }));
      setIsWatching(false);
    }
  };

  console.log("isConnected:", isConnected);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold text-center mb-4">Solana Transactions</h1>

        <div className="flex items-center justify-center mb-4">
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="border p-2 mr-2"
            placeholder="Threshold (SOL)"
          />
          <button
            onClick={isWatching ? handleStop : handleStart}
            className={`${isWatching ? 'bg-red-500 hover:bg-red-700' : 'bg-green-500 hover:bg-green-700'
              } text-white font-bold py-2 px-4 rounded`}
          >
            {isWatching ? 'Stop' : 'Start'}
          </button>
        </div>

        <div className="fixed bottom-4 right-4">
          <span
            className={`inline-block w-4 h-4 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
            title={isConnected ? 'Connected to WebSocket' : 'Disconnected from WebSocket'}
          ></span>
        </div>

        <div className="mt-4">
          <h2 className="text-lg font-semibold mb-2">Transactions:</h2>
          <ul className="border rounded-md overflow-hidden">
            {transactions.map((tx, index) => (
              <li
                key={index}
                className={`p-3 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                  } border-b last:border-b-0`}
              >
                <p>
                  <strong>Signature:</strong> {tx.signature}
                </p>
                <p>
                  <strong>Amount:</strong> {tx.solAmount} SOL
                </p>
                <p><strong>Block Time:</strong> {new Date(tx.blockTime * 1000).toLocaleString()}</p>
                <p><strong>Slot:</strong> {tx.slot}</p>

              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
