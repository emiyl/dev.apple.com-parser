const syncRequest = require('sync-request')
const fs = require('fs')
const path = require('path')
const { parse } = require('node-html-parser')

const htmlPath = path.resolve(__dirname, 'dev.apple.com.html')
const osList = JSON.parse(syncRequest('GET', 'https://api.appledb.dev/ios/main.json').body.toString())
const deviceList = JSON.parse(syncRequest('GET','https://api.appledb.dev/device/main.json').body.toString())
const groupList = JSON.parse(syncRequest('GET','https://api.appledb.dev/group/main.json').body.toString())

let data = fs.readFileSync(htmlPath, 'utf8')
data = data.split('<!-- Operating Systems Tab -->')[1]
data = data.split('<!-- Applications Tab -->')[0]
data = parse(data)
data = data.querySelectorAll('div').filter(x => x.rawAttrs.includes('class="column large-9 medium-8 small-12"'))
data = data.filter(x => x.innerHTML.includes('<h2>'))

let firmwareArr = []
data.map(fw => {
    let o = {}

    const hStr = fw.querySelector('h2').innerHTML.replace(' ',',').split(',')
    let osStr = hStr[0]
    let version = hStr[1]
    if (osStr == 'iPadOS') osStr = 'iOS' 

    const buildNum = fw.querySelectorAll('li')
    .filter(x => x.innerHTML.includes('Build'))[0]
    .innerHTML.split('</span>')[1]

    const released = fw.querySelectorAll('li')
    .filter(x => x.innerHTML.includes('Released'))[0]
    .innerHTML.split('</span>')[1]

    const deviceLinks = fw.querySelectorAll('div').filter(x => x.rawAttrs.includes('class="inner'))[0]
    
    let devicesObj = {}
        
    let lastFw = Object.keys(osList).map(x => osList[x])
    .sort((a,b) => {
        if (a.released < b.released) return -1
        if (a.released > b.released) return 1
        return 0
    })
    .filter(x => x.osStr == osStr)
    lastFw = lastFw[lastFw.length-1]
    const lastFwDevices = Object.keys(lastFw.devices).map(x => deviceList[x])

    if (!deviceLinks && osStr == 'watchOS') {
        const devices = lastFwDevices
        .filter(x => x.type == 'Apple Watch')
        .map(x => x.identifier)

        devices.map(x => devicesObj[x] = {})
    } else if (osStr == 'tvOS') {
        const devices = lastFwDevices
        .filter(x => x.type == 'Apple TV')
        .map(x => x.identifier)

        const ipswLinkArr = deviceLinks.querySelectorAll('li').map(x => {
            const anchor = x.querySelector('a')
            const devName = anchor.innerHTML.replace('&nbsp;',' ')
            const devIdentifier = Object.keys(deviceList).map(x => deviceList[x])
                .filter(x => x.name.includes(devName))
                .filter(x => x.type == 'Apple TV')[0]
                .identifier
            const link = anchor.rawAttrs.split('href="')[1].split('.ipsw"')[0]
            return {
                [devIdentifier]: {
                    "ipsw": link
                }
            }
        })
        let ipswLink = {}
        for (const o of ipswLinkArr) {
            for (const d in o) {
                ipswLink[d] = {
                    ipsw: o[d].ipsw
                }
            }
        }

        devices.map(x => {
            if (Object.keys(ipswLink).includes(x)) devicesObj[x] = ipswLink[x]
            else devicesObj[x] = {}
        })
    } else if (osStr == 'iOS') {
        const devices = lastFwDevices
        .filter(x => x.type == 'iPhone' || x.type.includes('iPad') || x.type == 'iPod')
        .map(x => x.identifier)

        const ipswLinkArr = deviceLinks.querySelectorAll('li').map(x => {
            const anchor = x.querySelector('a')

            let devName = anchor.innerHTML
            .replace('/&nbsp;/g',' ')
            .replace(/in\./g,'inch')
            .replace(/ /g,' ')
            .toLowerCase().split(', ')
            .map(n => {
                if (n.includes('-inch')) {
                    if (n.includes(' ipad pro ')) {
                        n = n.split(' ipad pro ')
                        n = ['ipad pro'].concat(n).join(' ')
                    } else if (n.includes('ipad (')) {
                        n = n.split(' ')
                        n.splice(0,1)
                        n = n.join(' ')
                    }
                }
                return n
            })

            let devNameT = []
            const match = ['(1st and 2nd generations)','(3rd and 4th generations)']
            for (let d of devName) {
                if (!match.some(r => d.includes(r))) devNameT.push(d)
                else {
                    let ret = []
                    if (d.includes(match[0])) {
                        d = d.replace(match[0],'')
                        ret.push(...[
                            d + '(1st generation)',
                            d + '(2nd generation)'
                        ])
                    } else if (d.includes(match[1])) {
                        d = d.replace(match[1],'')
                        ret.push(...[
                            d + '(3rd generation)',
                            d + '(4th generation)'
                        ])
                    }
                    devNameT.push(...ret)
                }
            }

            devName = devNameT.map(x => {
                const nameChangeLookup = {
                    "ipad pro 10.5-inch (1st generation)": "ipad pro (10.5-inch)",
                    "ipad pro 12.9-inch (2nd generation)": "ipad pro (12.9-inch) (2nd generation)",
                    "ipad pro 9.7-inch (1st generation)": "ipad pro (9.7-inch)",
                    "ipad pro 12.9-inch (1st generation)": "ipad pro (12.9-inch) (1st generation)",
                }
                if (Object.keys(nameChangeLookup).includes(x)) x = nameChangeLookup[x]
                return x
            })
            let idArr = []

            devName.map(n => {
                if (n == 'iPhone SE'.toLowerCase()) {
                    idArr.push('iPhone8,4')
                } else {
                    let dev = Object.keys(groupList).map(x => groupList[x])
                    .filter(x => x.subgroups).map(x => x.subgroups).flat()
                    .filter(x => n == x.name.toLowerCase())[0]
                    if (!dev) {
                        dev = Object.keys(groupList).map(x => groupList[x])
                            .filter(x => n == x.name.toLowerCase())[0]
                        if (!dev) {
                            dev = Object.keys(deviceList).map(x => deviceList[x])
                            .filter(x => n == x.name.toLowerCase())[0]
                            if (!dev) {
                                console.log(n)
                                return
                            }
                        }
                    }
                    idArr.push(...dev.devices || dev.identifier)
                }
            })
            const link = anchor.rawAttrs.split('href="')[1].split('.ipsw"')[0] + '.ipsw'
            let retObj = {}
            for (const id of idArr) retObj[id] = {
                "ipsw": link
            }
            return retObj
        }).filter(x => x)
        let ipswLink = {}
        for (const o of ipswLinkArr) {
            for (const d in o) {
                ipswLink[d] = {
                    ipsw: o[d].ipsw
                }
            }
        }

        devices.map(x => {
            if (Object.keys(ipswLink).includes(x)) devicesObj[x] = ipswLink[x]
            else devicesObj[x] = {}
        })
    } else if (deviceLinks.innerHTML.includes('Mac computers with the M1 chip')) {
        const ipswLink = deviceLinks.innerHTML.split('href="')[1].split(".ipsw")[0] + '.ipsw'

        const devices = lastFwDevices
        .filter(x => x.type.includes('Mac') && x.soc)
        .filter(x => x.soc.includes('M1'))
        .map(x => x.identifier)

        devices.map(x => devicesObj[x] = {
            "ipsw": ipswLink
        })
    }

    if (firmwareArr.filter(x => x.osStr == 'iOS').length > 0 && osStr == 'iOS') {
        for (const dev in devicesObj)
            if (devicesObj[dev].ipsw) firmwareArr.filter(x => x.osStr == 'iOS')[0].devices[dev] = devicesObj[dev]
        return
    }

    o.osStr = osStr
    o.version = version
    o.build = buildNum
    o.released = new Date(released + 'Z').toISOString().slice(0,10)
    o.beta = hStr[1].includes('beta') || hStr[1].includes('RC')
    o.devices = devicesObj

    firmwareArr.push(o)
})

if (!fs.existsSync('out')) fs.mkdirSync('out')
firmwareArr.map(x => {
    if (!fs.existsSync(`out/${x.osStr}`)) fs.mkdirSync(`out/${x.osStr}`)
    fs.writeFile(`out/${x.osStr}/${x.build}.json`, JSON.stringify(x,null,2), (err) => {
        if (err) console.log(err)
    })
})