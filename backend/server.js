const express = require("express");
const simpleGit = require("simple-git");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 8000;

// -------------------
// Dynamic port allocation
// -------------------
let currentPort = 9000;
function getNextPort() {
  return currentPort++;
}

// -------------------
// In-memory storage
// -------------------
let deployments = [];

// Ensure projects directory exists
const projectsDir = path.join(__dirname, "projects");
if (!fs.existsSync(projectsDir)) {
  fs.mkdirSync(projectsDir);
}

// -------------------
// DEPLOY ROUTE
// -------------------
app.post("/deploy", async (req, res) => {
  let { repoUrl } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ message: "Repo URL required" });
  }

  repoUrl = repoUrl.trim();

  const id = Date.now();
  const projectPath = path.join(projectsDir, String(id));

  const newDeploy = {
    id,
    repoUrl,
    status: "cloning",
  };

  deployments.push(newDeploy);

  // Respond immediately
  res.json({
    message: "Deployment started",
    data: newDeploy,
  });

  try {
    console.log("Cloning:", repoUrl);
    await simpleGit().clone(repoUrl, projectPath);

    newDeploy.status = "installing";
    console.log("Installing dependencies...");

    exec("npm install", { cwd: projectPath }, (installErr) => {
      if (installErr) {
        console.error("Install failed:", installErr.message);
        newDeploy.status = "failed";
        return;
      }

      console.log("Install complete");

      const port = getNextPort();
      newDeploy.port = port;
      newDeploy.status = "building";

      const imageName = `cloudlab-${id}-${Math.floor(Math.random() * 1000)}`;
      newDeploy.image = imageName;

      const dockerfilePath = path.join(projectPath, "Dockerfile");

      // Auto-generate Dockerfile if not exists
      if (!fs.existsSync(dockerfilePath)) {
        console.log("Generating Dockerfile...");

        const dockerfileContent = `
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
        `;

        fs.writeFileSync(dockerfilePath, dockerfileContent.trim());
      }

      console.log("Building Docker image...");

      exec(
        `docker build -t ${imageName} .`,
        { cwd: projectPath },
        (buildErr) => {
          if (buildErr) {
            console.error("Docker build failed:", buildErr.message);
            newDeploy.status = "failed";
            return;
          }

          console.log("Docker image built");

          newDeploy.status = "starting";

          exec(
            `docker run -d -e PORT=3000 -p ${port}:3000 --name ${imageName} ${imageName}`,
            (runErr) => {
              if (runErr) {
                console.error("Docker run failed:", runErr.message);
                newDeploy.status = "failed";
                return;
              }

              newDeploy.status = "running";
              newDeploy.url = `http://localhost:${port}`;

              console.log("Container running at", newDeploy.url);
            },
          );
        },
      );
    });
  } catch (error) {
    console.error("Clone failed:", error.message);
    newDeploy.status = "failed";
  }
});

// -------------------
// GET DEPLOYMENTS
// -------------------
app.get("/deployments", (req, res) => {
  res.json(deployments);
});

// -------------------
// STOP DEPLOYMENT
// -------------------
app.post("/stop/:id", (req, res) => {
  const { id } = req.params;

  const deployment = deployments.find((d) => d.id == id);

  if (!deployment) {
    return res.status(404).json({ message: "Deployment not found" });
  }

  if (!deployment.image) {
    return res.status(400).json({ message: "No container to stop" });
  }

  exec(`docker stop ${deployment.image}`, () => {
    exec(`docker rm ${deployment.image}`, () => {
      deployment.status = "stopped";
      console.log("Container stopped:", deployment.image);
      res.json({ message: "Deployment stopped" });
    });
  });
});

// -------------------
// DELETE DEPLOYMENT
// -------------------
app.delete("/delete/:id", (req, res) => {
  const { id } = req.params;

  const index = deployments.findIndex((d) => d.id == id);

  if (index === -1) {
    return res.status(404).json({ message: "Deployment not found" });
  }

  const deployment = deployments[index];
  const projectPath = path.join(projectsDir, String(id));

  exec(`docker stop ${deployment.image}`, () => {
    exec(`docker rm ${deployment.image}`, () => {
      exec(`docker rmi ${deployment.image}`, () => {
        // Remove project folder
        if (fs.existsSync(projectPath)) {
          fs.rmSync(projectPath, { recursive: true, force: true });
        }

        deployments.splice(index, 1);
        console.log("Deployment deleted completely:", deployment.image);

        res.json({ message: "Deployment deleted completely" });
      });
    });
  });
});

app.get("/stats/:id", (req, res) => {
  const { id } = req.params;
  const deployment = deployments.find((d) => d.id == id);

  if (!deployment || !deployment.image) {
    return res.status(404).json({ message: "Container not found" });
  }

  exec(
    `docker stats ${deployment.image} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}"`,
    (err, stdout) => {
      if (err) {
        return res.status(500).json({ message: "Failed to fetch stats" });
      }

      const [cpu, memory] = stdout.trim().split("|");

      res.json({
        cpu,
        memory,
      });
    },
  );
});

app.get("/logs/:id", (req, res) => {
  const { id } = req.params;

  const deployment = deployments.find((d) => d.id == id);

  if (!deployment) {
    return res.status(404).json({ message: "Deployment not found" });
  }

  if (!deployment.image) {
    return res.status(400).json({ message: "No container found" });
  }

  exec(`docker logs ${deployment.image}`, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ message: "Failed to fetch logs" });
    }

    res.json({ logs: stdout || stderr });
  });
});

// -------------------
// START SERVER
// -------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
