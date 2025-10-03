import app from "./app.js";
import emailWorker from "./queues/emailWorker.js";
import taskWorker from "./queues/taskWorker.js";

const main = () => {
  
  const PORT = process.env.APP_PORT || 3001;
  const HOST = process.env.APP_HOST || "0.0.0.0";   
  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });

};

main();
