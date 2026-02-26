import { useState, useEffect } from "react";
import axios from "axios";

function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const [deployments, setDeployments] = useState([]);
  const [selectedLogs, setSelectedLogs] = useState(null);
  const [logsContent, setLogsContent] = useState("");
  const [stats, setStats] = useState({});

  const fetchDeployments = async () => {
    const res = await axios.get("http://localhost:8000/deployments");
    setDeployments(res.data.slice().reverse());
  };

  const fetchLogs = async (id) => {
    const res = await axios.get(`http://localhost:8000/logs/${id}`);
    setLogsContent(res.data.logs || "");
  };

  const fetchStats = async (id) => {
    const res = await axios.get(`http://localhost:8000/stats/${id}`);
    setStats((prev) => ({ ...prev, [id]: res.data }));
  };

  const handleDeploy = async () => {
    if (!repoUrl) return;
    await axios.post("http://localhost:8000/deploy", { repoUrl });
    setRepoUrl("");
    fetchDeployments();
  };

  useEffect(() => {
    fetchDeployments();
    const interval = setInterval(fetchDeployments, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    deployments.forEach((d) => {
      if (d.status === "running") {
        fetchStats(d.id);
      }
    });
  }, [deployments]);

  const statusLED = (status) => {
    switch (status) {
      case "running":
        return "bg-green-500";
      case "failed":
        return "bg-red-500";
      case "stopped":
        return "bg-gray-500";
      default:
        return "bg-yellow-500";
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0f14] text-gray-200 font-mono">
      {/* HEADER */}
      <div className="border-b border-gray-800 px-10 py-5 bg-[#11151c]">
        <h1 className="text-blue-400 tracking-wide text-lg">
          CloudLab Distributed Runtime Console
        </h1>
      </div>

      <div className="p-10">
        {/* DEPLOY SECTION */}
        <div className="mb-10">
          <h2 className="text-sm uppercase text-gray-500 mb-4">
            Deployment Control
          </h2>

          <div className="flex gap-4">
            <input
              type="text"
              placeholder="GitHub Repository URL"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="flex-1 bg-[#161b22] border border-gray-700 p-3 text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleDeploy}
              className="bg-blue-600 px-6 text-sm hover:bg-blue-700 transition"
            >
              Deploy
            </button>
          </div>
        </div>

        {/* SYSTEM OVERVIEW */}
        <div className="mb-10 grid grid-cols-3 gap-6 text-xs">
          <div className="border border-gray-800 p-6 bg-[#161b22]">
            <p className="text-gray-500 mb-2">Total Deployments</p>
            <p className="text-xl">{deployments.length}</p>
          </div>
          <div className="border border-gray-800 p-6 bg-[#161b22]">
            <p className="text-gray-500 mb-2">Running Containers</p>
            <p className="text-xl">
              {deployments.filter((d) => d.status === "running").length}
            </p>
          </div>
          <div className="border border-gray-800 p-6 bg-[#161b22]">
            <p className="text-gray-500 mb-2">Runtime Engine</p>
            <p className="text-xl text-blue-400">Docker</p>
          </div>
        </div>

        {/* DEPLOYMENT TABLE */}
        <div className="space-y-6">
          {deployments.map((d) => (
            <div key={d.id} className="border border-gray-800 bg-[#161b22] p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-sm break-all text-gray-400">{d.repoUrl}</p>
                  {d.url && <p className="text-xs text-blue-400">{d.url}</p>}
                </div>

                <div className="flex items-center gap-2 text-xs uppercase tracking-wide">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      d.status === "running"
                        ? "bg-green-500"
                        : d.status === "failed"
                          ? "bg-red-500"
                          : d.status === "stopped"
                            ? "bg-gray-500"
                            : "bg-yellow-500"
                    }`}
                  ></span>
                  {d.status}
                </div>
              </div>

              {/* METRICS */}
              {d.status === "running" && stats[d.id] && (
                <div className="grid grid-cols-2 gap-6 text-xs mb-4">
                  <div>
                    <p className="text-gray-500">CPU Usage</p>
                    <p>{stats[d.id].cpu}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Memory Usage</p>
                    <p>{stats[d.id].memory}</p>
                  </div>
                </div>
              )}

              {/* ACTION CONTROLS */}
              <div className="flex gap-4 text-xs">
                {d.status === "running" && (
                  <>
                    <button
                      onClick={async () => {
                        await axios.post(`http://localhost:8000/stop/${d.id}`);
                        fetchDeployments();
                      }}
                      className="border border-red-600 text-red-400 px-4 py-2 hover:bg-red-600/10 transition"
                    >
                      Stop
                    </button>

                    <button
                      onClick={() => {
                        setSelectedLogs(d.id);
                        fetchLogs(d.id);
                      }}
                      className="border border-blue-600 text-blue-400 px-4 py-2 hover:bg-blue-600/10 transition"
                    >
                      Logs
                    </button>
                  </>
                )}

                <button
                  onClick={async () => {
                    await axios.delete(`http://localhost:8000/delete/${d.id}`);
                    fetchDeployments();
                  }}
                  className="border border-gray-600 text-gray-300 px-4 py-2 hover:bg-gray-600/10 transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LOGS PANEL */}
      {selectedLogs && (
        <div className="fixed bottom-0 left-0 right-0 h-1/3 bg-black border-t border-gray-800 p-6 overflow-auto">
          <div className="flex justify-between text-xs mb-3">
            <span className="text-blue-400">Live Runtime Output</span>
            <button
              onClick={() => setSelectedLogs(null)}
              className="text-red-400"
            >
              Close
            </button>
          </div>

          <pre className="text-green-400 text-xs whitespace-pre-wrap">
            {logsContent}
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;
