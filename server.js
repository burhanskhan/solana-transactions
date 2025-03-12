import { WebSocketServer } from 'ws';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const wss = new WebSocketServer({ port: 8080 });
console.log('WebSocket server listening on port 8080');

const solanaRpcUrl = process.env.SOLANA_RPC_URL;
const connection = new Connection(solanaRpcUrl, 'confirmed');
console.log('Solana connection established:', connection.rpcEndpoint);

let threshold = 100;
let isWatching = false;
let signatures = [];
let client = null;


async function fetchTransactionWithRetry(signature, retries = 5, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            const transaction = await connection.getParsedTransaction(signature, { commitment: "finalized", "maxSupportedTransactionVersion": 0 });
            if (transaction) {
                return transaction;
            } else {
                console.warn(`Transaction not found yet. Retry #${i + 1}/${retries} - Waiting ${delay}ms`);
            }
        } catch (error) {
            console.error(`Error fetching transaction (Attempt ${i + 1}):`, error);
        }

        await new Promise(resolve => setTimeout(resolve, delay));
    }

    console.error(`🚨 Transaction ${signature} not found after ${retries} retries.`);
    return null;
}

async function watchTransactions(thresholdSOL) {    
    if (isWatching) return;
    isWatching = true;

    console.log(`🔍 Watching for transactions >= ${thresholdSOL} SOL on the entire Solana network`);

    connection.onLogs(
        'all',
         async (logInfo) => {

            console.log("✅ New transaction log detected:", logInfo.signature);

            if (logInfo.err) {
                console.log("❌ Skipping failed transaction:", logInfo.signature, logInfo.err);
                return;
            }

            const signature = logInfo.signature;
            if (signatures.includes(signature)) {
                console.log("⚠️ Duplicate signature, skipping:", signature);
                return;
            }

            signatures.push(signature);
            if (signatures.length > 50) {
                signatures = signatures.slice(-50);
            }

            console.log("⏳ Fetching transaction details for:", signature);

            const transaction = await fetchTransactionWithRetry(signature);

            if (!transaction) {
                console.warn("🚨 Transaction not found after retries:", signature);
                return;
            }

            let totalTransfer = 0;
            if (transaction.meta?.postBalances && transaction.meta?.preBalances) {
                for (let i = 0; i < transaction.meta.postBalances.length; i++) {
                    const diff = transaction.meta.postBalances[i] - transaction.meta.preBalances[i];
                    if (diff > 0) {
                        totalTransfer += diff;
                    }
                }
            }

            const solTransfer = totalTransfer / LAMPORTS_PER_SOL;
            console.log(`🔹 Total Transfer: ${solTransfer} SOL`);

            if (solTransfer >= thresholdSOL) {
                const transactionData = {
                    signature: signature,
                    solAmount: solTransfer,
                    blockTime: transaction.blockTime,
                    slot: transaction.slot
                };
                console.log("🚀 Sending transaction data to client:", transactionData);

                if (client && client.readyState === 1) {
                    client.send(JSON.stringify({ type: 'transaction', data: transactionData }));
                }
            }
        },
        "confirmed"
    );
}

wss.on('connection', ws => {
    client = ws;
    console.log('Client connected');
    ws.send(JSON.stringify({ type: 'status', data: { isWatching, threshold } }));

    ws.on('message', message => {
        console.log("Received message from client:", message);
        try {
            const parsedMessage = JSON.parse(message);
            if (parsedMessage.type === 'start') {
                threshold = parsedMessage.threshold;
                watchTransactions(threshold);
            } else if (parsedMessage.type === 'stop') {
                isWatching = false;
                console.log('Stopped watching transactions');
            }
        } catch (error) {
            console.error('Invalid message format:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        isWatching = false;
        client = null;
    });

    ws.on('error', (error) => {
        console.error("Client connection error:", error);
    });
});
