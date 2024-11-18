const express = require('express');
const venom = require('venom-bot');
const path = require('path');
const app = express();
const port = 3000;

// Rate limiting configuration
const messageQueue = [];
let isProcessing = false;
const RATE_LIMIT_DELAY = 1000; // Base delay of 1 second
const JITTER = 500; // Additional random delay up to 500 ms

// Detect platform
const isWindows = process.platform === 'win32';

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Store the client instance
let whatsappClient = null;

// Initialize venom-bot with platform-specific configurations
venom
  .create({
    session: 'session-name',
    headless: isWindows ? false : true, // GUI mode on Windows, headless on Linux
    useChrome: true,
    browserArgs: isWindows ? [
      `--user-data-dir=${path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data')}`,
      '--profile-directory=Profile 3'
    ] : [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  })
  .then((client) => {
    whatsappClient = client;
    console.log('Bot is ready!');
  })
  .catch((error) => {
    console.error('Error creating client:', error);
  });

// Function to add a randomized delay
function getRandomDelay(baseDelay, jitter = 500) {
  return baseDelay + Math.floor(Math.random() * jitter);
}

// Process message queue
async function processQueue() {
    if (isProcessing || messageQueue.length === 0) return;
    
    isProcessing = true;
    
    while (messageQueue.length > 0) {
        const { phone, message, resolve, reject } = messageQueue.shift();
        
        try {
            const formattedPhone = phone.includes('@c.us') ? phone : `${phone}@c.us`;
            await whatsappClient.sendText(formattedPhone, message);
            resolve({ success: true });
        } catch (error) {
            reject(error);
        }
        
        // Wait before processing the next message with a randomized delay
        await new Promise(resolve => setTimeout(resolve, getRandomDelay(RATE_LIMIT_DELAY, JITTER)));
    }
    
    isProcessing = false;
}

// Route to serve the HTML form
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to send a message
app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;
    
    if (!whatsappClient) {
        return res.status(500).json({ error: 'WhatsApp client not initialized' });
    }

    if (!phone || !message) {
        return res.status(400).json({ error: 'Phone and message are required' });
    }

    try {
        // Add message to the queue
        const result = await new Promise((resolve, reject) => {
            messageQueue.push({ phone, message, resolve, reject });
            processQueue(); // Start processing if not already running
        });
        
        res.json(result);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Route to get client status
app.get('/status', (req, res) => {
    res.json({ 
        status: whatsappClient ? 'connected' : 'disconnected',
        queueLength: messageQueue.length
    });
});

// Start server with platform-aware host binding
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://${isWindows ? 'localhost' : '0.0.0.0'}:${port}`);
});