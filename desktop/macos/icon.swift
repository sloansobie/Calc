import Cocoa
let output = CommandLine.arguments[1]
let size = NSSize(width:1024, height:1024)
let image = NSImage(size:size)
image.lockFocus()
let body = NSBezierPath(roundedRect:NSRect(x:80,y:80,width:864,height:864),xRadius:190,yRadius:190)
NSColor(calibratedRed:0.23,green:0.39,blue:0.75,alpha:1).setFill(); body.fill()
let screen = NSBezierPath(roundedRect:NSRect(x:212,y:653,width:600,height:159),xRadius:30,yRadius:30)
NSColor(calibratedRed:0.91,green:0.95,blue:1,alpha:1).setFill(); screen.fill()
let text = "√  π  2²" as NSString
text.draw(at:NSPoint(x:250,y:681),withAttributes:[.font:NSFont.systemFont(ofSize:78,weight:.medium),.foregroundColor:NSColor(calibratedRed:0.16,green:0.29,blue:0.58,alpha:1)])
for row in 0..<3 { for col in 0..<4 {
    let rect=NSRect(x:212+col*156,y:213+row*138,width:132,height:114)
    let button=NSBezierPath(roundedRect:rect,xRadius:22,yRadius:22)
    (col==3 ? NSColor(calibratedRed:0.61,green:0.74,blue:1,alpha:1) : NSColor.white.withAlphaComponent(0.9)).setFill();button.fill()
}}
image.unlockFocus()
let data=NSBitmapImageRep(data:image.tiffRepresentation!)!.representation(using:.png,properties:[:])!
try data.write(to:URL(fileURLWithPath:output))
