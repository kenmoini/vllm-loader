```
vLLM is a great performant LLM server, however it is difficult to manage the serving of multiple models.  Create a plan for a containerized NextJS application that provides an interface for:
1. Downloading a GGUF model from a remote URL or S3 bucket
2. Starting/stopping vLLM with the different models and form inputs for execution configuration
3. A chat interface to access the running models
The NextJS app should be able to spawn/kill the vLLM process in the same container that it is running in and show the status of the process and loaded model
```

```
Great work - let's add some live updating of the models as they're being downloaded.  Currently you have to refresh the Models page to see the updated status of the Active Downloads, this should be regularly updated or progress streamed as it downloads ideally.
```