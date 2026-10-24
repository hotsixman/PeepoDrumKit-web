// NOTE: Web port of PeepoDrumKit (https://github.com/samyuu/PeepoDrumKit) by Samyuu
import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";

const app = mount(App, { target: document.getElementById("app")! });

export default app;
