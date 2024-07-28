import express from "express";
import bodyParser from "body-parser";
import https from "https";

const cert = process.env.SSL_CERT;
const key = process.env.SSL_KEY;

if (!cert || !key) {
  throw new Error("SSL_CERT and SSL_KEY are required");
}

const annotationName = process.env.ANNOTATION || "spookyless.net/delay-pod";
const delayAmountDefault = parseInt(process.env.DEFAULT_DELAY || "5");

const app = express();
app.use(bodyParser.json());

const podResource = { group: "", version: "v1", resource: "pods" };

app.post("/mutate", (req, res) => {
  try {
    const admissionReview = req.body;

    if (
      admissionReview.request.resource.group !== podResource.group ||
      admissionReview.request.resource.version !== podResource.version ||
      admissionReview.request.resource.resource !== podResource.resource
    ) {
      return res.status(400).json({ message: "Invalid resource" });
    }

    const pod = admissionReview.request.object;
    const annotations = pod.metadata.annotations || {};

    let patch = [];
    if (annotationName in annotations) {
      console.log(`Patching resource ${pod.kind} ${pod.metadata.namespace}/${pod.metadata.name}`);

      let delayAmount = parseInt(annotations[annotationName]);
      if (isNaN(delayAmount)) { delayAmount = delayAmountDefault; }

      const initContainer = {
        name: "delay-pod",
        image: "busybox",
        command: ["sh", "-c", `sleep ${delayAmount}`],
      };

      patch = [
        {
          op: "add",
          path: "/spec/initContainers",
          value: [initContainer],
        },
      ];
    } else {
      console.log(`Ignoring resource ${pod.kind} ${pod.metadata.namespace}/${pod.metadata.name}`);
    }

    const admissionResponse = {
      uid: admissionReview.request.uid,
      allowed: true,
      patch:
        patch.length > 0
          ? Buffer.from(JSON.stringify(patch)).toString("base64")
          : undefined,
      patchType: patch.length > 0 ? "JSONPatch" : undefined,
    };

    res.json({
      apiVersion: "admission.k8s.io/v1",
      kind: "AdmissionReview",
      response: admissionResponse,
    });
  } catch (e) {
    console.warn(e);

    if (!res.closed) {
      res.status(500).end();
    }
  }
});

const PORT = process.env.PORT || 8080;

https.createServer({ cert, key }, app).listen(PORT, () => {
  console.log(`Delay-pod server running on port ${PORT}`);
});