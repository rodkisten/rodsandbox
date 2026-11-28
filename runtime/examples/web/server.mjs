import http from "node:http";
const server = http.createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.end(
    JSON.stringify({
      status: "ok",
      service: "rodsandbox-runtime-probe",
      path: request.url,
    }),
  );
});
server.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
