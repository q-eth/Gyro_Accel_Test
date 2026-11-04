# Gyro & Accelerometer Lab

An educational web app that shows live data from a phone's accelerometer and gyroscope.

- **Accelerometer**: acceleration on the X, Y and Z axes in **g** or **m/s²** (toggle button). A sphere with a red dot shows the X/Y acceleration vector, and a bar shows Z.
- **Gyroscope**: orientation in degrees for each axis (β = X, γ = Y, α = Z), the raw angular velocity in °/s, and a 3D plane that tilts with the phone relative to a fixed horizontal reference plane.

It is plain HTML, CSS and JavaScript, with no build step and no dependencies.

## Run it

Motion sensors only work in a **secure context (HTTPS)** on a device that has them, so open the GitHub Pages URL on your phone.

- **Android (Chrome):** the sensors start automatically.
- **iPhone/iPad (Safari):** tap **Start sensors** and allow *Motion & Orientation* access.

To test locally on a computer, serve the folder (for example `python -m http.server`) and open `http://localhost:8000`. Then use Chrome DevTools → *More tools → Sensors* to simulate device orientation.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under *Build and deployment*, choose **Deploy from a branch**, select `main` and `/ (root)`, and click Save.
4. After a minute the site is live at `https://<user>.github.io/<repo>/`.

## Coordinate system

The axes follow the [W3C DeviceOrientation spec](https://www.w3.org/TR/orientation-event/):

| Axis | Points toward | Rotation angle |
|------|---------------|----------------|
| X | right edge of the screen | β (pitch), −180°…180° |
| Y | top edge of the screen | γ (roll), −90°…90° |
| Z | out of the screen | α (yaw), 0°…360° |

`accelerationIncludingGravity` measures how the phone is being pushed, not where gravity pulls it. When the phone lies flat, the table pushes it upward, so the reading is about **+1 g on Z**. When you tilt the phone, that 1 g is split across the X, Y and Z axes, and that split is what moves the red dot.

## Files

```
index.html      page markup and the SVG sphere
css/style.css   layout and the CSS 3D scene
js/app.js       sensor handling and rendering
```
