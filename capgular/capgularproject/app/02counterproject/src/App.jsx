import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);
  // let counter = 5
  const addValue = () => {
    // counter = counter + 1
    if(count >=20) {
      alert("Counter cannot exceed 20");
      return;
    }

    setCount(count + 1);
  }
  const reduceValue = () => {
    // counter = counter - 1
    if(count <= 0) {
      alert("Counter cannot be less than 0");
      return;
    }
    setCount(count - 1);
  }
  return (
    <>
      <h1>Vite + React {count}</h1>
      <h2>Counter Value: {count} </h2>
      <button onClick={addValue}>Increment {count}</button>
      <button onClick={reduceValue}>Decrement {count}</button>
    </>
  );
}

export default App;
